import { MINUTE_MILLIS } from '../constants';
import { Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { createTimedCache } from '../utils';

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

interface IAddressStats {
  pending: number;
  completed: number;
  savingsUsd: number;
}

export interface IStatsService {
  getStats(): Promise<IStats>;
  getStatsForAddress(address: string): Promise<IAddressStats>;
}

const statsCache = createTimedCache<Promise<any>>(5 * MINUTE_MILLIS);
const addressStatsCache = createTimedCache<Promise<any>>(MINUTE_MILLIS);

export class StatsService implements IStatsService {
  public async getStats(): Promise<IStats> {
    const cacheKey = 'stats';
    const cachedRes = statsCache.get(cacheKey);

    if (cachedRes) {
      return cachedRes;
    }

    const promise = this._getStats();
    statsCache.put(cacheKey, promise);

    return promise;
  }

  private async _getStats(): Promise<IStats> {
    const rawStats = await Scheduled.aggregate([
      {
        $match: {
          status: { $in: [Status.Pending, Status.Completed] },
          assetName: { $exists: true },
        },
      },
      {
        $group: {
          _id: {
            status: '$status',
            assetName: '$assetName',
          },
          status: { $first: '$status' },
          txCount: { $sum: 1 },
          value: { $sum: '$assetValue' },
        },
      },
      {
        $group: {
          _id: {
            status: '$status',
          },
          status: { $first: '$status' },
          txCount: { $sum: '$txCount' },
          assetCount: { $sum: 1 },
          value: { $sum: '$value' },
        },
      },
    ]);

    const stats = { pending: {}, completed: {} };
    rawStats
      .map((item) => {
        item.status = item.status === Status.Pending ? 'pending' : 'completed';
        return item;
      })
      .forEach((item) => {
        const { status } = item;
        stats[status] = {
          txCount: item.txCount,
          assetCount: item.assetCount,
          value: item.value,
        };
      });

    return stats;
  }

  public getStatsForAddress(address: string): Promise<IAddressStats> {
    const cachedRes = addressStatsCache.get(address);

    if (cachedRes) {
      return cachedRes;
    }

    const promise = this._getStatsForAddress(address);
    addressStatsCache.put(address, promise);

    return promise;
  }

  private async _getStatsForAddress(address: string): Promise<IAddressStats> {
    const txs = await Scheduled.find({
      from: new RegExp(`^${address}$`, 'i'),
    });

    const stats: IAddressStats = {
      pending: 0,
      completed: 0,
      savingsUsd: 0,
    };

    txs.forEach((tx) => {
      if (tx.status === Status.Pending) {
        stats.pending += 1;
      } else if (tx.status === Status.Completed) {
        stats.completed += 1;
      }

      stats.savingsUsd += tx.gasSaved || 0;
    });

    stats.savingsUsd = Number(stats.savingsUsd.toFixed(2));

    return stats;
  }
}
