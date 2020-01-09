import {
  AssetType,
  IScheduled,
  IScheduleRequest,
  ITransactionMetadata,
  Status,
} from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import * as ethUtils from './ethereum/utils';
import * as polkadotUtils from './polkadot/utils';

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
    } else {
      transaction = new Scheduled(request);
    }
    const metadata = await this.getTransactionMetadata(transaction);
    transaction.assetName = metadata.assetName;
    transaction.assetAmount = metadata.assetAmount;
    transaction.assetValue = metadata.assetValue;
    transaction.status = Status.Pending;
    transaction.createdAt = new Date().toISOString();

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

  private getTransactionMetadata(
    transaction: IScheduled,
  ): Promise<ITransactionMetadata> {
    switch (transaction.assetType) {
      case AssetType.Ethereum:
      case undefined: {
        return ethUtils.fetchTransactionMetadata(transaction);
      }
      case AssetType.Polkadot: {
        return polkadotUtils.fetchTransactionMetadata(transaction);
      }
    }
  }

  private findBySignedTransaction(signedTransaction: string) {
    return Scheduled.findOne({ signedTransaction }).exec();
  }
}
