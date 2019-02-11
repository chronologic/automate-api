import { ethers } from 'ethers';

import { IScheduled, IScheduleRequest, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';

export interface IScheduleService {
  schedule(request: IScheduleRequest): Promise<IScheduled>;
  find(id: string): Promise<IScheduled>;
  cancel(id: string);
  getPending(): Promise<IScheduled[]>;
}

export class ScheduleService implements IScheduleService {
  public async schedule(request: IScheduleRequest) {
    await new Scheduled(request).validate();

    let transaction = await this.findBySignedTransaction(
      request.signedTransaction
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
    transaction.status = Status.Pending;

    return transaction.save();
  }

  public find(id: string) {
    return Scheduled.findById(id).exec();
  }

  public cancel(id: string) {
    return Scheduled.updateOne(
      { _id: id },
      { status: Status.Cancelled }
    ).exec();
  }

  public getPending(): Promise<IScheduled[]> {
    return Scheduled.where('status', Status.Pending).exec();
  }

  private findBySignedTransaction(signedTransaction: string) {
    const { from, nonce, chainId } = ethers.utils.parseTransaction(
      signedTransaction
    );
    return Scheduled.findOne({ from, nonce, chainId }).exec();
  }
}
