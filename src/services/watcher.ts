import { ethers } from 'ethers';

import { Processor } from './processor';
import { ScheduleService } from './schedule';
import { TransactionExecutor } from './transaction';

export class Watcher {
  public static init() {
    const processor = new Processor(
      new ScheduleService(),
      new TransactionExecutor()
    );

    ethers
      .getDefaultProvider()
      .on('block', (blockNum: number) => processor.process(blockNum));
  }
}
