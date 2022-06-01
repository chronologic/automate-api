import { ChainId, SECOND_MILLIS } from '../../constants';

import { AssetType, IScheduled, Status } from '../../models/Models';
import Scheduled from '../../models/ScheduledSchema';
import { sleep } from '../../utils';
import { ScheduleService } from '../schedule';
import logger from './logger';
import { Processor } from './processor';
import { TransactionExecutor } from './transaction';
import { fetchTransactionMetadata } from './utils';

export class Watcher {
  public static async init() {
    logger.info('Starting ethereum watcher...');
    await Watcher.fillMissingMetadata();
    await Watcher.fillMissingAssetType();

    const transactionExecutor = new TransactionExecutor();
    const processor = new Processor(new ScheduleService(), transactionExecutor);

    Watcher.processInLoop(processor);
  }

  public static async processByIds(ids: string[]) {
    const transactionExecutor = new TransactionExecutor();
    const processor = new Processor(new ScheduleService(), transactionExecutor);

    processor.processByIds(ids);
  }

  private static async processInLoop(processor: Processor) {
    try {
      await Promise.all([sleep(10 * SECOND_MILLIS), processor.process()]);
    } catch (e) {
      logger.error(e?.message);
    } finally {
      Watcher.processInLoop(processor);
    }
  }

  public static async fillMetadataByIds(ids: string[]): Promise<void> {
    const res: IScheduled[] = await Scheduled.where('_id', ids).exec();

    for (const row of res) {
      await Watcher.updateMetadata(row);
    }
  }

  private static async fillMissingMetadata(): Promise<void> {
    const res = await Scheduled.find({
      assetType: { $in: [AssetType.Ethereum, null, undefined] },
      status: { $in: [Status.Completed, Status.Pending] },
      chainId: ChainId.Ethereum,
      $or: [
        { assetName: { $exists: false } },
        { assetAmount: { $exists: false } },
        { assetValue: { $exists: false } },
        { executedAt: { $exists: false } },
      ],
    });

    for (const row of res) {
      await Watcher.updateMetadata(row);
    }
  }

  private static async updateMetadata(scheduled: IScheduled): Promise<void> {
    const metadata = await fetchTransactionMetadata(scheduled);

    await scheduled.update({ ...metadata, gasPrice: metadata.txGasPrice }).exec();
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
