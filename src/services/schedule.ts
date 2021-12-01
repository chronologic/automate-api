import {
  AssetType,
  IAssetMetadata,
  IScheduled,
  IScheduledForUser,
  IScheduleParams,
  IScheduleRequest,
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
import { createTimedCache, mapToScheduledForUser } from '../utils';
import { CREDITS } from '../env';
import webhookService from './webhook';
import { MINUTE_MILLIS } from '../constants';

const DEV_PAYMENT_EMAILS = process.env.DEV_PAYMENT_EMAILS.split(';').map((str) => str.toLowerCase());
const PAYMENTS_ENABLED = process.env.PAYMENT === 'true';
const COUPON_CODES = process.env.COUPON_CODES.split(';').map((str) => str.toLowerCase());

const txCache = createTimedCache(5 * MINUTE_MILLIS);

export interface IScheduleService {
  schedule(request: IScheduleRequest, params?: IScheduleParams): Promise<IScheduled>;
  find(id: string): Promise<IScheduled>;
  cancel(id: string);
  getPending(assetType: AssetType): Promise<IScheduled[]>;
  listForApiKey(apiKey: string): Promise<IScheduledForUser[]>;
  getByHash(apiKey: string, hash: string): Promise<IScheduledForUser>;
  getMaxNonce(apiKey: string, address: string, chainId: number): Promise<number>;
}

export class ScheduleService implements IScheduleService {
  public async schedule(request: IScheduleRequest, params?: IScheduleParams) {
    if (params?.source === 'proxy') {
      if (txCache.get(request.signedTransaction)) {
        throw new Error('Duplicate request');
      }

      txCache.put(request.signedTransaction, true);
    }

    await new Scheduled(request).validate();

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

    if (params?.apiKey) {
      const user = await UserService.validateApiKey(params.apiKey);

      if (CREDITS && !transactionExists) {
        await UserService.deductCredits(user, request.signedTransaction);
      }

      transaction.userId = user.id;
    }

    const metadata = await this.getTransactionMetadata(transaction);
    transaction.assetName = metadata.assetName;
    transaction.assetAmount = metadata.assetAmount;
    transaction.assetAmountWei = metadata.assetAmountWei;
    transaction.assetDecimals = metadata.assetDecimals;
    transaction.assetValue = metadata.assetValue;
    transaction.assetContract = metadata.assetContract;
    transaction.gasPriceAware = request.gasPriceAware === true || (request.gasPriceAware as any) === 'true';

    transaction.scheduledEthPrice = metadata.ethPrice;
    transaction.scheduledGasPrice = metadata.gasPrice;
    transaction.gasPaid = metadata.gasPaid;
    transaction.gasSaved = metadata.gasSaved;

    // if newly creating a tx, autopopulate condition to match the asset being transferred
    if (!transactionExists && params?.apiKey) {
      transaction.conditionAsset = metadata.assetContract;
      transaction.conditionAmount = metadata.assetAmountWei;
      transaction.conditionAssetDecimals = metadata.assetDecimals;
    }

    const conditionAssetMetadata = await this.getConditionAssetMetadata(transaction);
    transaction.conditionAssetName = conditionAssetMetadata.name;
    transaction.conditionAssetDecimals = conditionAssetMetadata.decimals;

    const isDevTx = this.isDevTx(request.paymentEmail);
    const isValidCouponCode = this.isValidCouponCode(request.paymentRefundAddress);

    const freeTx = isDevTx || isValidCouponCode || !PAYMENTS_ENABLED;

    const prevStatus = transaction.status;

    if (params?.apiKey) {
      if (params?.draft === true || (params?.draft as any) === 'true') {
        transaction.status = transaction.status || Status.Draft;
      } else {
        transaction.status = transaction.status === Status.Draft ? Status.Pending : transaction.status;
      }
      transaction.status = transaction.status || Status.Pending;
    } else {
      transaction.status = freeTx ? Status.Pending : Status.PendingPayment;
    }
    transaction.paymentAddress = freeTx ? '' : PaymentService.getNextPaymentAddress();

    const scheduled = await transaction.save();

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

  // optimize this function - takes too much time
  private async getTransactionMetadata(transaction: IScheduled): Promise<ITransactionMetadata> {
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
