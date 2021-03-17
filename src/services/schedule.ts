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
import { Key } from './key';
import getApi from './polkadot/api';
import { UserService } from './user';

const DEV_PAYMENT_EMAILS = process.env.DEV_PAYMENT_EMAILS.split(
  ';',
).map((str) => str.toLowerCase());
const PAYMENTS_ENABLED = process.env.PAYMENT === 'true';
const COUPON_CODES = process.env.COUPON_CODES.split(';').map((str) =>
  str.toLowerCase(),
);

export interface IScheduleService {
  schedule(
    request: IScheduleRequest,
    params?: IScheduleParams,
  ): Promise<IScheduled>;
  find(id: string): Promise<IScheduled>;
  cancel(id: string);
  getPending(assetType: AssetType): Promise<IScheduled[]>;
  listForApiKey(apiKey: string): Promise<IScheduledForUser[]>;
  getByHash(apiKey: string, hash: string): Promise<IScheduledForUser>;
  getMaxNonce(
    apiKey: string,
    address: string,
    chainId: number,
  ): Promise<number>;
}

export class ScheduleService implements IScheduleService {
  public async schedule(request: IScheduleRequest, params?: IScheduleParams) {
    await new Scheduled(request).validate();

    let transaction = await this.findBySignedTransaction(
      request.signedTransaction,
    );

    if (transaction) {
      transaction.conditionAmount = request.conditionAmount;
      transaction.conditionAsset = request.conditionAsset;
      transaction.gasPriceAware = request.gasPriceAware;
      transaction.signedTransaction = request.signedTransaction;
      transaction.timeCondition = request.timeCondition;
      transaction.timeConditionTZ = request.timeConditionTZ;
      transaction.paymentEmail = request.paymentEmail;
      transaction.paymentRefundAddress = request.paymentRefundAddress;
    } else {
      transaction = new Scheduled(request);
    }
    transaction.notes = request.notes;

    if (params?.apiKey) {
      const user = await UserService.validateApiKey(params.apiKey);

      transaction.userId = user.id;
    }

    const metadata = await this.getTransactionMetadata(transaction);
    transaction.assetName = metadata.assetName;
    transaction.assetAmount = metadata.assetAmount;
    transaction.assetValue = metadata.assetValue;
    transaction.assetContract = metadata.assetContract;
    transaction.gasPriceAware = request.gasPriceAware;

    const conditionAssetMetadata = await this.getConditionAssetMetadata(
      transaction,
    );
    transaction.conditionAssetName = conditionAssetMetadata.name;
    transaction.conditionAssetDecimals = conditionAssetMetadata.decimals;

    const isDevTx = this.isDevTx(request.paymentEmail);
    const isValidCouponCode = this.isValidCouponCode(
      request.paymentRefundAddress,
    );

    const freeTx = isDevTx || isValidCouponCode || !PAYMENTS_ENABLED;

    if (params?.apiKey) {
      if (params?.draft) {
        transaction.status = transaction.status || Status.Draft;
      } else {
        transaction.status =
          transaction.status === Status.Draft
            ? Status.Pending
            : transaction.status;
      }
      transaction.status = transaction.status || Status.Pending;
    } else {
      transaction.status = freeTx ? Status.Pending : Status.PendingPayment;
    }
    transaction.paymentAddress = freeTx
      ? ''
      : PaymentService.getNextPaymentAddress();

    const scheduled = await transaction.save();

    send(scheduled, 'scheduled');

    return scheduled;
  }

  public find(id: string) {
    return Scheduled.findById(id).exec();
  }

  public async cancel(id: string) {
    const res = await Scheduled.updateOne(
      { _id: id },
      { status: Status.Cancelled },
    ).exec();

    const scheduled = await Scheduled.findById(id).exec();
    send(scheduled, 'cancelled');

    return res;
  }

  public getPending(assetType: AssetType): Promise<IScheduled[]> {
    let assetTypeCondition: AssetType | AssetType[] = assetType;

    if ([undefined, AssetType.Ethereum].includes(assetType)) {
      assetTypeCondition = [undefined, assetType];
    }
    return Scheduled.where('status', Status.Pending)
      .where('assetType', assetTypeCondition)
      .exec();
  }

  public async listForApiKey(apiKey: string): Promise<IScheduledForUser[]> {
    const user = await UserService.validateApiKey(apiKey);

    const scheduleds = await Scheduled.find({ userId: user.id }).exec();

    return scheduleds
      .map((s) => this.mapToScheduledForUser(s))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse();
  }

  public async getByHash(
    apiKey: string,
    hash: string,
  ): Promise<IScheduledForUser> {
    const user = await UserService.validateApiKey(apiKey);

    const scheduled = await Scheduled.findOne({
      userId: user.id,
      transactionHash: hash,
    }).exec();

    if (scheduled) {
      return this.mapToScheduledForUser(scheduled);
    }

    return null;
  }

  public async getMaxNonce(
    apiKey: string,
    address: string,
    chainId: number,
  ): Promise<number> {
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

  private mapToScheduledForUser(scheduled: IScheduled): IScheduledForUser {
    return {
      id: scheduled.id,
      assetAmount: scheduled.assetAmount,
      assetName: scheduled.assetName,
      assetType: scheduled.assetType,
      assetValue: scheduled.assetValue,
      assetContract: scheduled.assetContract,
      chainId: scheduled.chainId,
      conditionAmount: scheduled.conditionAmount,
      conditionAsset: scheduled.conditionAsset,
      conditionAssetDecimals: scheduled.conditionAssetDecimals,
      conditionAssetName: scheduled.conditionAssetName,
      conditionBlock: scheduled.conditionBlock,
      createdAt: scheduled.createdAt,
      error: scheduled.error,
      executedAt: scheduled.executedAt,
      executionAttempts: scheduled.executionAttempts,
      from: scheduled.from,
      to: scheduled.to,
      gasPrice: scheduled.gasPrice,
      gasPriceAware: scheduled.gasPriceAware,
      lastExecutionAttempt: scheduled.lastExecutionAttempt,
      nonce: scheduled.nonce,
      signedTransaction: scheduled.signedTransaction,
      status: scheduled.status,
      timeCondition: scheduled.timeCondition,
      timeConditionTZ: scheduled.timeConditionTZ,
      transactionHash: scheduled.transactionHash,
      txKey: Key.generate(scheduled._id),
      notes: scheduled.notes,
    };
  }

  private async getConditionAssetMetadata(
    transaction: IScheduled,
  ): Promise<IAssetMetadata> {
    switch (transaction.assetType) {
      case AssetType.Ethereum:
      case undefined: {
        return ethUtils.fetchAssetMetadata(transaction);
      }
      case AssetType.Polkadot: {
        return {
          name: '',
          decimals: 10,
        };
      }
    }
  }

  private async getTransactionMetadata(
    transaction: IScheduled,
  ): Promise<ITransactionMetadata> {
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
