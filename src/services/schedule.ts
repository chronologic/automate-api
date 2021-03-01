import {
  AssetType,
  IScheduled,
  IScheduleRequest,
  ITransactionMetadata,
  Status,
} from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import * as ethUtils from './ethereum/utils';
import send from './mail';
import { PaymentService } from './payment';
import getApi from './polkadot/api';

const DEV_PAYMENT_EMAILS = process.env.DEV_PAYMENT_EMAILS.split(
  ';',
).map((str) => str.toLowerCase());
const PAYMENTS_ENABLED = process.env.PAYMENT === 'true';
const COUPON_CODES = process.env.COUPON_CODES.split(';').map((str) =>
  str.toLowerCase(),
);

export interface IScheduleService {
  schedule(request: IScheduleRequest): Promise<IScheduled>;
  find(id: string): Promise<IScheduled>;
  cancel(id: string);
  getPending(assetType: AssetType): Promise<IScheduled[]>;
}

export class ScheduleService implements IScheduleService {
  public async schedule(request: IScheduleRequest) {
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
    const metadata = await this.getTransactionMetadata(transaction);
    transaction.assetName = metadata.assetName;
    transaction.assetAmount = metadata.assetAmount;
    transaction.assetValue = metadata.assetValue;
    transaction.createdAt = new Date().toISOString();
    transaction.gasPriceAware = request.gasPriceAware;

    const isDevTx = this.isDevTx(request.paymentEmail);
    const isValidCouponCode = this.isValidCouponCode(
      request.paymentRefundAddress,
    );
    const freeTx = isDevTx || isValidCouponCode || !PAYMENTS_ENABLED;

    transaction.status = freeTx ? Status.Pending : Status.PendingPayment;
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
