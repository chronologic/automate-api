import { ethers } from 'ethers';

import { AssetType, Status } from '../../models/Models';
import Scheduled from '../../models/ScheduledSchema';
import { ScheduleService } from '../schedule';
import logger from './logger';
import { Processor } from './processor';
import { TransactionExecutor } from './transaction';
import { fetchTransactionMetadata } from './utils';

export class Watcher {
  public static async init() {
    const transactionExecutor = new TransactionExecutor();
    await Watcher.fillMissingMetadata();
    await Watcher.fillMissingAssetType();

    const processor = new Processor(new ScheduleService(), transactionExecutor);

    ethers.getDefaultProvider().on('block', (blockNum: number) => processor.process(blockNum));
  }

  private static async fillMissingMetadata(): Promise<void> {
    const res = await Scheduled.find({
      assetType: { $in: [AssetType.Ethereum, null, undefined] },
      status: { $in: [Status.Completed, Status.Pending] },
      chainId: 1,
      $or: [
        { assetName: { $exists: false } },
        { assetAmount: { $exists: false } },
        { assetValue: { $exists: false } },
        { executedAt: { $exists: false } },
      ],
    });

    for (const row of res) {
      const metadata = await fetchTransactionMetadata(row);

      await row.update(metadata).exec();
    }
  }

  private static async fillMissingAssetType(): Promise<void> {
    const { n } = await Scheduled.updateMany(
      {
        assetType: { $in: [null, undefined] },
      },
      {
        assetType: AssetType.Ethereum,
      },
    );

    logger.info(`Filled missing asset type in ${n} rows`);
  }
}
