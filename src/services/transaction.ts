import { IScheduledForUser, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { UserService } from './user';
import send from './mail';
import { mapToScheduledForUser } from './txLabel';

export interface ITransactionService {
  list(apiKey: string): Promise<IScheduledForUser[]>;
  cancel(id: string);
  batchUpdateNotes(apiKey: string, updates: IBatchUpdateNotes[]): Promise<void>;
}

interface IBatchUpdateNotes {
  transactionHash: string;
  notes: string;
}

async function cancel(id: string) {
  const res = await Scheduled.updateOne({ _id: id }, { status: Status.Cancelled }).exec();

  const scheduled = await Scheduled.findById(id).exec();
  send(scheduled, 'cancelled');

  return res;
}

async function list(apiKey: string): Promise<IScheduledForUser[]> {
  const user = await UserService.validateApiKey(apiKey);
  const scheduleds = await Scheduled.find({ userId: user.id }).exec();
  const mappedScheduleds = await Promise.all(scheduleds.map(mapToScheduledForUser));

  return mappedScheduleds.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).reverse();
}

async function batchUpdateNotes(apiKey: string, updates: IBatchUpdateNotes[]): Promise<void> {
  const user = await UserService.validateApiKey(apiKey);

  for (const update of updates) {
    await Scheduled.updateOne({ transactionHash: update.transactionHash, userId: user.id }, { notes: update.notes });
  }
}

export const transactionService: ITransactionService = {
  list,
  cancel,
  batchUpdateNotes,
};
