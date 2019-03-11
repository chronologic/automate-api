import { ethers } from 'ethers';

import { Processor } from './processor';
import { ScheduleService } from './schedule';
import { Tracker } from './tracker';
import { TransactionExecutor } from './transaction';

export class Watcher {
  public static init() {
    const tracker = new Tracker();

    const processor = new Processor(
      new ScheduleService(tracker),
      new TransactionExecutor(),
      tracker
    );

    ethers
      .getDefaultProvider()
      .on('block', (blockNum: number) => processor.process(blockNum));
  }
}
