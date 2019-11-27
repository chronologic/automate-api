import { Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';

interface IStatsItem {
  count: number;
  amount: number;
  value: number;
}

interface IStatsDict {
  [key: string]: IStatsItem;
}

interface IStats {
  pending: IStatsDict;
  completed: IStatsDict;
}

export interface IStatsService {
  getStats(): Promise<IStats>;
}

export class StatsService implements IStatsService {
  public async getStats(): Promise<IStats> {
    const rawStats = await Scheduled.aggregate([
      { $match: { status: { $in: [Status.Pending, Status.Completed] } } },
      {
        $group: {
          _id: {
            status: '$status',
            assetName: '$assetName'
          },
          count: { $sum: 1 },
          value: { $sum: '$assetValue' },
          amount: { $sum: '$assetAmount' }
        }
      }
    ]);

    const stats = { pending: {}, completed: {} };
    rawStats
      .filter(item => item._id.assetName)
      .map(item => {
        item._id.status =
          item._id.status === Status.Pending ? 'pending' : 'completed';
        return item;
      })
      .forEach(item => {
        const { status, assetName } = item._id;
        stats[status][assetName] = {
          count: item.count,
          amount: item.amount,
          value: item.value
        };
      });

    return stats;
  }
}
