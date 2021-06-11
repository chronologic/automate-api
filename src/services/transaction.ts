import { IScheduledForUser, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { UserService } from './user';
import send from './mail';
import { mapToScheduledForUser } from '../utils';

export interface ITransactionService {
  list(apiKey: string): Promise<IScheduledForUser[]>;
  cancel(id: string);
}

export class TransactionService implements ITransactionService {
  public async cancel(id: string) {
    const res = await Scheduled.updateOne({ _id: id }, { status: Status.Cancelled }).exec();

    const scheduled = await Scheduled.findById(id).exec();
    send(scheduled, 'cancelled');

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
