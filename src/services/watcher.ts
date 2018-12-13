import { CronJob } from 'cron';

import { Processor } from './processor';
import { ScheduleService } from './schedule';
import { TransactionExecutor } from './transaction';

export class Watcher {
  public static init() {
    const processor = new Processor(
      new ScheduleService(),
      new TransactionExecutor()
    );
    // tslint:disable-next-line:no-unused-expression
    new CronJob('* * * * *', () => processor.process(), null, true);
  }
}
