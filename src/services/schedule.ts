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
import { createTimedCache, isTruthy, mapToScheduledForUser } from '../utils';
import { CREDITS } from '../env';
import webhookService from './webhook';
import { MINUTE_MILLIS } from '../constants';
import { strategyService } from './strategy';

const DEV_PAYMENT_EMAILS = process.env.DEV_PAYMENT_EMAILS.split(';').map((str) => str.toLowerCase());
const PAYMENTS_ENABLED = process.env.PAYMENT === 'true';
const COUPON_CODES = process.env.COUPON_CODES.split(';').map((str) => str.toLowerCase());

const txCache = createTimedCache(5 * MINUTE_MILLIS);

export interface IScheduleService {
  schedule(request: IScheduleRequest, params: IScheduleParams): Promise<IScheduled>;
  find(id: string): Promise<IScheduled>;
  cancel(id: string);
  getPending(assetType: AssetType): Promise<IScheduled[]>;
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
        await UserService.deductCredits(user, request.signedTransaction);
      }

      transaction.userId = user.id;
    }

    const { isStrategyPrepTx, strategyPrepId } = await checkStrategyPrep(transaction);

    transaction = await populateTransactionMetadata({
      transaction,
      isGasPriceAware: isTruthy(request.gasPriceAware),
      isProxyRequest,
      transactionExists,
    });

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
    });

    transaction.paymentAddress = isFreeTx ? '' : PaymentService.getNextPaymentAddress();

    // extra check for duplicate in db
    // if same tx didn't exist when the process started
    // this should still be the case
    // otherwise we have a problem
    if (!transactionExists) {
      const duplicate = await this.findBySignedTransaction(request.signedTransaction);
      if (duplicate) {
        throw new Error(`Duplicate transaction ${request.signedTransaction}`);
      }
    }

    const scheduled = await transaction.save();

    if (isStrategyPrepTx) {
      await strategyService.deletePrepTx(transaction.userId!, strategyPrepId!);
    }

    if (transaction.status !== prevStatus && transaction.status === Status.Pending) {
      send(scheduled, 'scheduled');
      tgBot.scheduled({ value: transaction.assetValue, savings: transaction.gasSaved });
      webhookService.notify(scheduled);
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

  public getPending(assetType: AssetType): Promise<IScheduled[]> {
    let assetTypeCondition: AssetType | AssetType[] = assetType;

    if ([undefined, AssetType.Ethereum].includes(assetType)) {
      assetTypeCondition = [undefined, assetType];
    }
    return Scheduled.where('status', Status.Pending).where('assetType', assetTypeCondition).exec();
  }

  public async listForApiKey(apiKey: string): Promise<IScheduledForUser[]> {
    const user = await UserService.validateApiKey(apiKey);

    const scheduleds = await Scheduled.find({ userId: user.id }).exec();

    return scheduleds
      .map((s) => mapToScheduledForUser(s))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse();
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

  private findBySignedTransaction(signedTransaction: string) {
    return Scheduled.findOne({ signedTransaction }).exec();
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
  let transaction = await this.findBySignedTransaction(request.signedTransaction);
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

  return {
    transaction,
    transactionExists,
  };
}

function calculateNewStatus({
  currentStatus,
  isFreeTx,
  isDraft,
  isProxyRequest,
}: {
  currentStatus: Status;
  isFreeTx: boolean;
  isDraft: boolean;
  isProxyRequest: boolean;
}): Status {
  if (!isProxyRequest) {
    return isFreeTx ? Status.Pending : Status.PendingPayment;
  }

  let newStatus = currentStatus;

  if (isDraft) {
    newStatus = newStatus || Status.Draft;
  } else {
    newStatus = newStatus === Status.Draft ? Status.Pending : newStatus;
  }
  newStatus = newStatus || Status.Pending;

  return newStatus;
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

function decodeTxForStrategyPrep(transaction: IScheduled): IStrategyPrepTx {
  switch (transaction.assetType) {
    case AssetType.Ethereum:
    case undefined: {
      const parsed = ethers.utils.parseTransaction(transaction.signedTransaction);

      return {
        assetType: AssetType.Ethereum,
        chainId: parsed.chainId,
        from: parsed.from,
        to: parsed.to,
        nonce: parsed.nonce,
        data: parsed.data,
      };
    }
    case AssetType.Polkadot:
    default: {
      throw new Error('Implementme!');
    }
  }
}

async function checkStrategyPrep(
  transaction: IScheduled,
): Promise<{ isStrategyPrepTx: boolean; strategyPrepId?: string }> {
  const defaultResult = { isStrategyPrepTx: false };

  if (!transaction.userId) {
    return defaultResult;
  }

  const userId = transaction.userId!;
  const hasAnyPrep = await strategyService.hasAnyPrep(userId);

  if (!hasAnyPrep) {
    return defaultResult;
  }

  const prepTx = decodeTxForStrategyPrep(transaction);
  const strategyPrep = await strategyService.matchPrep(userId, prepTx);
  const isStrategyPrepTx = !!strategyPrep;

  if (hasAnyPrep && !isStrategyPrepTx) {
    throw new Error('User is already executing another strategy');
  }

  if (!isStrategyPrepTx) {
    return defaultResult;
  }

  return { isStrategyPrepTx, strategyPrepId: strategyPrep.id };
}
