import { IScheduledForUser, Status, ITxList } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { UserService } from './user';
import send from './mail';
import { mapToScheduledForUser } from './txLabel';

export interface ITransactionService {
  list(apiKey: string, opts?: IOpts): Promise<ITxList>;
  cancel(id: string);
  batchUpdateNotes(apiKey: string, updates: IBatchUpdateNotes[]): Promise<void>;
}

interface IBatchUpdateNotes {
  transactionHash: string;
  notes: string;
}

interface IOpts {
  index: number;
  size: number;
  sortCol: string;
  sortDir: string;
}

async function cancel(id: string) {
  const res = await Scheduled.updateOne({ _id: id }, { status: Status.Cancelled }).exec();

  const scheduled = await Scheduled.findById(id).exec();
  send(scheduled, 'cancelled');

  return res;
}
async function list(apiKey: string, opts: IOpts): Promise<ITxList> {
  const user = await UserService.validateApiKey(apiKey);

  const totalTxs = await Scheduled.countDocuments({
    userId: user.id,
  }).exec();

  const currentPage = Number(opts.index) || 0;
  const txPerPage = Number(opts.size);

  const sortObject = {};
  const stype = opts.sortCol || 'createdAt';
  const sdir = opts.sortDir || -1;
  sortObject[stype] = sdir;

  const scheduleds = await Scheduled.find({
    userId: user.id,
  })
    .sort(sortObject)
    .limit(txPerPage)
    .skip((currentPage - 1) * txPerPage)
    .exec();

  const result = await Promise.all(scheduleds.map(mapToScheduledForUser));
  return { items: result, total: totalTxs };
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
