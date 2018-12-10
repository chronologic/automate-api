import { CronJob } from 'cron';
import Scheduled from '../models/ScheduledSchema';
import { Status } from '../models/Models';
import { Processor } from './processor';
import logger from './logger';

export class Watcher {
  public static init() {
    new CronJob('* * * * *', () => Processor.process(), null, true);
  }

  public static async cancel(id: string) {
    await Scheduled.updateOne({ _id: id }, { status: Status.Cancelled }).exec();

    logger.info(`${id} Cancelled`);

    return Status.Cancelled;
  }
}
