import { CronJob } from 'cron';
import Scheduled from '../models/ScheduledSchema';
import { Status } from '../models/Models';
import { Processor } from './processor';
import logger from './logger';
import { ScheduleService } from './schedule';
import { TransactionExecutor } from './transaction';

export class Watcher {
  public static init() {
    const processor = new Processor(
      new ScheduleService(),
      new TransactionExecutor()
    );
    new CronJob('* * * * *', () => processor.process(), null, true);
  }
}
