import { AssetType, Status } from '../../models/Models';
import Scheduled from '../../models/ScheduledSchema';
import { Processor } from './processor';
import { ScheduleService } from './schedule';
import { TransactionExecutor } from './transaction';

export class Watcher {
  public static async init() {
    const transactionExecutor = new TransactionExecutor();
    await Watcher.fillMissingMetadata(transactionExecutor);

    const processor = new Processor(
      new ScheduleService(transactionExecutor),
      transactionExecutor,
    );

    // ethers
    //   .getDefaultProvider()
    //   .on('block', (blockNum: number) => processor.process(blockNum));
  }

  private static async fillMissingMetadata(
    transactionExecutor: TransactionExecutor,
  ): Promise<void> {
    const res = await Scheduled.find({
      assetType: { $in: [AssetType.Polkadot] },
      status: { $in: [Status.Completed, Status.Pending] },
      // chainId: 1,
      $or: [
        { assetName: { $exists: false } },
        { assetAmount: { $exists: false } },
        { assetValue: { $exists: false } },
        { executedAt: { $exists: false } },
      ],
    });

    for (const row of res) {
      const metadata = await transactionExecutor.fetchTransactionMetadata(row);

      await row.update(metadata).exec();
    }
  }
}
