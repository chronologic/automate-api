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
      {
        $match: {
          status: { $in: [Status.Pending, Status.Completed] },
          assetName: { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            status: '$status',
            assetName: '$assetName'
          },
          status: { $first: '$status' },
          txCount: { $sum: 1 },
          value: { $sum: '$assetValue' }
        }
      },
      {
        $group: {
          _id: {
            status: '$status'
          },
          status: { $first: '$status' },
          txCount: { $sum: '$txCount' },
          assetCount: { $sum: 1 },
          value: { $sum: '$value' }
        }
      }
    ]);

    const stats = { pending: {}, completed: {} };
    rawStats
      .map(item => {
        item.status = item.status === Status.Pending ? 'pending' : 'completed';
        return item;
      })
      .forEach(item => {
        const { status } = item;
        stats[status] = {
          txCount: item.txCount,
          assetCount: item.assetCount,
          value: item.value
        };
      });

    return stats;
  }
}
