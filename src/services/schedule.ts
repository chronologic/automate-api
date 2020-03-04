import {
  AssetType,
  IScheduled,
  IScheduleRequest,
  ITransactionMetadata,
  Status,
} from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import * as ethUtils from './ethereum/utils';
import { PaymentService } from './payment';
import getApi from './polkadot/api';

const DEV_PAYMENT_EMAILS = process.env.DEV_PAYMENT_EMAILS.split(';').map(str =>
  str.toLowerCase(),
);
const PAYMENTS_ENABLED = process.env.PAYMENT === 'true';

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

    const isDevTx = this.isDevTx(request.paymentEmail);
    const freeTx = isDevTx || !PAYMENTS_ENABLED;

    transaction.status = freeTx ? Status.Pending : Status.PendingPayment;
    transaction.paymentAddress = freeTx
      ? ''
      : PaymentService.getNextPaymentAddress();

    return transaction.save();
  }

  public find(id: string) {
    return Scheduled.findById(id).exec();
  }

  public cancel(id: string) {
    return Scheduled.updateOne(
      { _id: id },
      { status: Status.Cancelled },
    ).exec();
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
}
