import { IScheduledForUser, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { UserService } from './user';
import send from './mail';
import { mapToScheduledForUser } from '../utils';

export interface ITransactionService {
  cancel(id: string);
  list(apiKey: string): Promise<IScheduledForUser[]>;
}

export class TransactionService implements ITransactionService {
  public async cancel(id: string) {
    const res = await Scheduled.updateOne({ _id: id }, { status: Status.Cancelled }).exec();
    /*
      The updateOne() method accepts a filter document and an update document Return a document that contains some fields
        _id, the method throws an exception. If your update document contains a value that violates unique index rules
        .exec() is to make Mongo queries Promise. 
    */
    const scheduled = await Scheduled.findById(id).exec();
    /*
      findById(id) method accepts id returns find a document by its id
      returns {_id: ..., data1: ..., data2: ....}
    */
    send(scheduled, 'cancelled'); // sends email
    return res;
  }

  public async list(apiKey: string): Promise<IScheduledForUser[]> {
    const user = await UserService.validateApiKey(apiKey);

    const scheduleds = await Scheduled.find({ userId: user.id }).exec();

    return scheduleds
      .map((s) => mapToScheduledForUser(s))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .reverse();
  }
}
