import { ethers } from 'ethers';

import {
  AssetType,
  IAssetMetadata,
  IScheduled,
  IScheduledForUser,
  IScheduleParams,
  IScheduleRequest,
  IStrategyPrepTx,
  ITransactionMetadata,
  Status,
} from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import * as ethUtils from './ethereum/utils';
import send from './mail';
import { PaymentService } from './payment';
import getApi from './polkadot/api';
import { UserService } from './user';
import tgBot from './telegram';
import { createTimedCache, decodeMethod, isTruthy } from '../utils';
import { CREDITS } from '../env';
import { ChainId, MINUTE_MILLIS } from '../constants';
import webhookService from './webhook';
import { strategyService } from './strategy';
import { transactionService } from './transaction';
import { mapToScheduledForUser } from './txLabel';

const DEV_PAYMENT_EMAILS = process.env.DEV_PAYMENT_EMAILS.split(';').map((str) => str.toLowerCase());
const PAYMENTS_ENABLED = process.env.PAYMENT === 'true';
const COUPON_CODES = process.env.COUPON_CODES.split(';').map((str) => str.toLowerCase());

const txCache = createTimedCache(5 * MINUTE_MILLIS);

export interface IScheduleService {
  schedule(request: IScheduleRequest, params: IScheduleParams): Promise<IScheduled>;
  find(id: string): Promise<IScheduled>;
  cancel(id: string);
  getPending(assetType: AssetType): Promise<IScheduled[]>;
  getByIds(assetType: AssetType, ids: string[]): Promise<IScheduled[]>;
  listForApiKey(apiKey: string): Promise<IScheduledForUser[]>;
  getByHash(apiKey: string, hash: string): Promise<IScheduledForUser>;
  getMaxNonce(apiKey: string, address: string, chainId: number): Promise<number>;
}

export class ScheduleService implements IScheduleService {
  public async schedule(request: IScheduleRequest, params: IScheduleParams) {
    const isProxyRequest = params.source === 'proxy';
    if (isProxyRequest) {
      if (txCache.get(request.signedTransaction)) {
        throw new Error('Duplicate request');
      }

      txCache.put(request.signedTransaction, true);
    }

    await new Scheduled(request).validate();

    const findOrCreateResult = await findOrCreateTransaction(request);
    let { transaction } = findOrCreateResult;
    const { transactionExists } = findOrCreateResult;

    if (isProxyRequest) {
      const user = await UserService.validateApiKey(params.apiKey);

      if (CREDITS && !transactionExists) {
        await UserService.deductCredits(user, request.signedTransaction, transaction.assetType);
      }

      transaction.userId = user.id;
    }

    const { isStrategyTx, transaction: matchedTransaction, isLastPrepForNonce } = await matchStrategyPrep(transaction);
    transaction = matchedTransaction;

    const isEthereumMainnetTx = transaction.chainId === ChainId.Ethereum;
    if (isEthereumMainnetTx) {
      transaction = await populateTransactionMetadata({
        transaction,
        isGasPriceAware: isTruthy(request.gasPriceAware),
        isProxyRequest,
        transactionExists,
      });
    }

    const conditionAssetMetadata = await this.getConditionAssetMetadata(transaction);
    transaction.conditionAssetName = conditionAssetMetadata.name;
    transaction.conditionAssetDecimals = conditionAssetMetadata.decimals;

    const isDevTx = this.isDevTx(request.paymentEmail);
    const isValidCouponCode = this.isValidCouponCode(request.paymentRefundAddress);

    const isFreeTx = isDevTx || isValidCouponCode || !PAYMENTS_ENABLED;

    const prevStatus = transaction.status;

    transaction.status = calculateNewStatus({
      currentStatus: transaction.status,
      isFreeTx,
      isDraft: params.draft,
      isProxyRequest,
      isStrategyTx,
    });

    transaction.paymentAddress = isFreeTx ? '' : PaymentService.getNextPaymentAddress();

    // extra check for duplicate in db
    // if same tx didn't exist when the process started
    // this should still be the case
    // otherwise we have a problem
    if (!transactionExists) {
      await checkForDuplicateTx(request.signedTransaction);
    }

    const scheduled = await transaction.save();

    if (isStrategyTx) {
      await strategyService.deletePrepTx(transaction.userId!, transaction.strategyPrepId!);
    }

    if (transaction.status !== prevStatus && transaction.status === Status.Pending) {
      sendEmail(scheduled);
      tgBot.scheduled({ value: transaction.assetValue, savings: transaction.gasSaved });
      webhookService.notify(scheduled);
    }

    if (isStrategyTx && !isLastPrepForNonce) {
      throw new Error(
        '[automate:metamask:nonce] This error is to prevent metamask from increasing the nonce in its internal counter',
      );
    }

    return scheduled;
  }

  public find(id: string) {
    return Scheduled.findById(id).exec();
  }

  public async cancel(id: string) {
    const res = await Scheduled.updateOne({ _id: id }, { status: Status.Cancelled }).exec();

    const scheduled = await Scheduled.findById(id).exec();
    send(scheduled, 'cancelled');

    return res;
  }

  public async getPending(assetType: AssetType): Promise<IScheduled[]> {
    let assetTypeCondition: AssetType | AssetType[] = assetType;

    if ([undefined, AssetType.Ethereum].includes(assetType)) {
      assetTypeCondition = [undefined, assetType];
    }
    const pending: IScheduled[] = await Scheduled.where('status', Status.Pending)
      .where('assetType', assetTypeCondition)
      .exec();

    return pending.map((item) => {
      item.priority = item.priority || 1;
      return item;
    });
  }

  public async getByIds(assetType: AssetType, ids: string[]): Promise<IScheduled[]> {
    const rows: IScheduled[] = await Scheduled.where('assetType', assetType).where('_id', ids).exec();

    return rows;
  }

  public async listForApiKey(apiKey: string): Promise<IScheduledForUser[]> {
    return transactionService.list(apiKey);
  }

  public async getByHash(apiKey: string, hash: string): Promise<IScheduledForUser> {
    const user = await UserService.validateApiKey(apiKey);

    const scheduled = await Scheduled.findOne({
      userId: user.id,
      transactionHash: hash,
    }).exec();

    if (scheduled) {
      return mapToScheduledForUser(scheduled);
    }

    return null;
  }

  public async getMaxNonce(apiKey: string, address: string, chainId: number): Promise<number> {
    const user = await UserService.validateApiKey(apiKey);

    const [scheduled] = await Scheduled.find({
      userId: user.id,
      from: address.toLowerCase(),
      chainId,
      status: {
        $nin: [Status.Cancelled],
      },
    })
      .sort({ nonce: -1 })
      .limit(1)
      .exec();

    if (scheduled) {
      return scheduled.nonce;
    }

    return -1;
  }

  private async getConditionAssetMetadata(transaction: IScheduled): Promise<IAssetMetadata> {
    switch (transaction.assetType) {
      case AssetType.Ethereum:
      case undefined: {
        return ethUtils.fetchConditionAssetMetadata(transaction);
      }
      case AssetType.Polkadot: {
        return {
          name: '',
          decimals: 10,
        };
      }
    }
  }

  private isDevTx(email: string): boolean {
    return DEV_PAYMENT_EMAILS.includes(email.toLowerCase());
  }

  private isValidCouponCode(paymentRefundAddress: string): boolean {
    return COUPON_CODES.includes(paymentRefundAddress.toLowerCase());
  }
}

async function findOrCreateTransaction(
  request: IScheduleRequest,
): Promise<{ transaction: IScheduled; transactionExists: boolean }> {
  let transaction = await findBySignedTransaction(request.signedTransaction);
  let transactionExists = false;

  if (transaction) {
    transactionExists = true;
    transaction.conditionAmount = request.conditionAmount;
    transaction.conditionAsset = request.conditionAsset;
    transaction.gasPriceAware = request.gasPriceAware;
    transaction.signedTransaction = request.signedTransaction;
    transaction.timeCondition = request.timeCondition;
    transaction.timeConditionTZ = request.timeConditionTZ;
    transaction.paymentEmail = request.paymentEmail || transaction.paymentEmail;
    transaction.paymentRefundAddress = request.paymentRefundAddress || transaction.paymentRefundAddress;
  } else {
    transaction = new Scheduled(request);
  }
  transaction.notes = request.notes;

  const decoded = ethers.utils.parseTransaction(transaction.signedTransaction);
  transaction.chainId = decoded.chainId;
  transaction.from = decoded.from;
  transaction.to = decoded.to;
  transaction.nonce = decoded.nonce;
  transaction.method = decodeMethod(transaction.assetType, transaction.signedTransaction);

  return {
    transaction,
    transactionExists,
  };
}

async function findBySignedTransaction(signedTransaction: string) {
  return Scheduled.findOne({ signedTransaction }).exec();
}

function calculateNewStatus({
  currentStatus,
  isFreeTx,
  isDraft,
  isProxyRequest,
  isStrategyTx,
}: {
  currentStatus: Status;
  isFreeTx: boolean;
  isDraft: boolean;
  isProxyRequest: boolean;
  isStrategyTx: boolean;
}): Status {
  return isProxyRequest
    ? calculateNewStatusForProxyRequest({
        currentStatus,
        isDraft,
        isStrategyTx,
      })
    : calculateNewStatusForDirectRequest({
        currentStatus,
        isFreeTx,
      });
}

function calculateNewStatusForProxyRequest({
  currentStatus,
  isDraft,
  isStrategyTx,
}: {
  currentStatus: Status;
  isDraft: boolean;
  isStrategyTx: boolean;
}): Status {
  if (isDraft && !isStrategyTx) {
    return currentStatus || Status.Draft;
  }

  return currentStatus || Status.Pending;
}

function calculateNewStatusForDirectRequest({
  currentStatus,
  isFreeTx,
}: {
  currentStatus: Status;
  isFreeTx: boolean;
}): Status {
  currentStatus = currentStatus || Status.Draft;

  if (currentStatus === Status.Draft) {
    return isFreeTx ? Status.Pending : Status.PendingPayment;
  }

  return currentStatus;
}

async function populateTransactionMetadata({
  transaction,
  isGasPriceAware,
  transactionExists,
  isProxyRequest,
}: {
  transaction: IScheduled;
  isGasPriceAware: boolean;
  transactionExists: boolean;
  isProxyRequest: boolean;
}): Promise<IScheduled> {
  const metadata = await getTransactionMetadata(transaction);
  transaction.assetName = metadata.assetName;
  transaction.assetAmount = metadata.assetAmount;
  transaction.assetAmountWei = metadata.assetAmountWei;
  transaction.assetDecimals = metadata.assetDecimals;
  transaction.assetValue = metadata.assetValue;
  transaction.assetContract = metadata.assetContract;
  transaction.gasPriceAware = isGasPriceAware;

  transaction.scheduledEthPrice = metadata.ethPrice;
  transaction.scheduledGasPrice = metadata.gasPrice;
  transaction.gasPaid = metadata.gasPaid;
  transaction.gasSaved = metadata.gasSaved;

  // if newly creating a tx, autopopulate condition to match the asset being transferred
  if (!transactionExists && isProxyRequest) {
    transaction.conditionAsset = metadata.assetContract;
    transaction.conditionAmount = metadata.assetAmountWei;
    transaction.conditionAssetDecimals = metadata.assetDecimals;
  }

  return transaction;
}

// TODO: optimize this function - takes too much time
async function getTransactionMetadata(transaction: IScheduled): Promise<ITransactionMetadata> {
  switch (transaction.assetType) {
    case AssetType.Ethereum:
    case undefined: {
      return ethUtils.fetchTransactionMetadata(transaction);
    }
    case AssetType.Polkadot: {
      const api = await getApi(transaction.chainId);
      return api.fetchTransactionMetadata(transaction);
    }
  }
}

async function matchStrategyPrep(
  transaction: IScheduled,
): Promise<{ transaction: IScheduled; isStrategyTx: boolean; isLastPrepForNonce: boolean }> {
  const defaultResult = { transaction, isStrategyTx: false, isLastPrepForNonce: true };

  if (!transaction.userId) {
    return defaultResult;
  }

  const userId = transaction.userId!;
  const hasAnyPrep = await strategyService.hasAnyPrep(userId);

  if (!hasAnyPrep) {
    return defaultResult;
  }

  const prepTx = decodeTxForStrategyPrep(transaction);
  const strategyPrep = await strategyService.matchFirstPrep(userId, prepTx);
  const isStrategyTx = !!strategyPrep;

  if (hasAnyPrep && !isStrategyTx) {
    throw new Error('User is executing a strategy but received tx that is not part of a strategy');
  }

  if (!isStrategyTx) {
    return defaultResult;
  }

  transaction.priority = strategyPrep.priority;
  transaction.conditionAsset = strategyPrep.conditionAsset;
  transaction.conditionAmount = strategyPrep.conditionAmount || '0';
  transaction.timeCondition = strategyPrep.timeCondition;
  transaction.timeConditionTZ = strategyPrep.timeConditionTZ;
  transaction.strategyInstanceId = strategyPrep.instanceId;
  transaction.strategyPrepId = strategyPrep.id;

  return { transaction, isStrategyTx, isLastPrepForNonce: strategyPrep.isLastForNonce };
}

function sendEmail(scheduled: IScheduled) {
  const isStrategyTx = !!scheduled.strategyPrepId;
  if (!isStrategyTx) {
    send(scheduled, 'scheduled');
  }
}

function decodeTxForStrategyPrep(transaction: IScheduled): IStrategyPrepTx {
  switch (transaction.assetType) {
    case AssetType.Ethereum:
    case undefined: {
      const parsed = ethers.utils.parseTransaction(transaction.signedTransaction);

      return {
        assetType: AssetType.Ethereum,
        chainId: parsed.chainId,
        from: parsed.from.toLowerCase(),
        to: parsed.to.toLowerCase(),
        data: parsed.data.toLowerCase(),
      };
    }
    case AssetType.Polkadot:
    default: {
      throw new Error('Implementme!');
    }
  }
}

async function checkForDuplicateTx(signedTransaction: string): Promise<void> {
  const duplicate = await findBySignedTransaction(signedTransaction);
  if (duplicate) {
    throw new Error(`Duplicate transaction ${signedTransaction}`);
  }
}
