import { IScheduled, IScheduledForUser, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { Key } from './key';
import { UserService } from './user';
import send from './mail';

export interface ITransactionService {
  list(apiKey: string): Promise<IScheduledForUser[]>;
  cancel(id: string);
}

export class TransactionService implements ITransactionService {
  public async cancel(id: string) {
    const res = await Scheduled.updateOne(
      { _id: id },
      { status: Status.Cancelled },
    ).exec();

    const scheduled = await Scheduled.findById(id).exec();
    send(scheduled, 'cancelled');

    return res;
  }

  public async list(apiKey: string): Promise<IScheduledForUser[]> {
    const user = await UserService.validateApiKey(apiKey);

    const scheduleds = await Scheduled.find({ userId: user.id }).exec();

    return scheduleds
      .map((s) => this.mapToScheduledForUser(s))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse();
  }

  private mapToScheduledForUser(scheduled: IScheduled): IScheduledForUser {
    return {
      id: scheduled.id,
      assetAmount: scheduled.assetAmount,
      assetName: scheduled.assetName,
      assetType: scheduled.assetType,
      assetValue: scheduled.assetValue,
      assetContract: scheduled.assetContract,
      assetDecimals: scheduled.assetDecimals,
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
}
