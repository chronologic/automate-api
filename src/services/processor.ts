import { IScheduled, Status } from '../models/Models';
import logger from './logger';
import { IScheduleService } from './schedule';
import { ITracker } from './tracker';
import { ITransactionExecutor } from './transaction';

export class Processor {
  private scheduleService: IScheduleService;
  private transactionExecutor: ITransactionExecutor;
  private tracker: ITracker;

  constructor(
    scheduleService: IScheduleService,
    transactionExecutor: ITransactionExecutor,
    tracker: ITracker
  ) {
    this.scheduleService = scheduleService;
    this.transactionExecutor = transactionExecutor;
    this.tracker = tracker;
  }

  public async process(blockNum: number) {
    logger.info(`Triggered by ${blockNum}`);

    const scheduled = await this.scheduleService.getPending();
    const groups = this.groupBySenderAndChain(scheduled);

    this.tracker.trackQueue(scheduled.length);

    logger.info(
      `Found ${scheduled.length} pending transactions in ${groups.size} groups`
    );

    const inProgress = [];
    groups.forEach(transactions =>
      inProgress.push(this.processTransactions(transactions, blockNum))
    );

    return Promise.all(inProgress);
  }

  private groupBySenderAndChain(scheduled: IScheduled[]) {
    const makeKey = (sender: string, chainId: number) =>
      `${sender}-${chainId.toString()}`;
    const groups: Map<string, IScheduled[]> = new Map<string, IScheduled[]>();

    scheduled.forEach(s => {
      const key = makeKey(s.from, s.chainId);

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(s);
    });

    return groups;
  }

  private async processTransactions(scheduled: IScheduled[], blockNum: number) {
    const sorted = scheduled.sort((a, b) => a.nonce - b.nonce);

    for (const transaction of sorted) {
      let res = false;
      try {
        res = await this.processTransaction(transaction, blockNum);
      } catch (e) {
        logger.error(`Processing ${transaction._id} failed with ${e}`);
      }
      if (!res) {
        break;
      }
    }
  }

  private async processTransaction(
    scheduled: IScheduled,
    blockNum: number
  ): Promise<boolean> {
    const {
      transactionHash,
      status,
      error
    } = await this.transactionExecutor.execute(scheduled, blockNum);

    if (status !== Status.Pending) {
      logger.info(`${scheduled._id} Completed with status ${Status[status]}`);

      scheduled.update({ transactionHash, status, error }).exec();

      this.tracker.trackTransaction(scheduled, status);

      return true;
    } else if (scheduled.conditionBlock === 0) {
      logger.info(`${scheduled._id} Starting confirmation tracker`);
      scheduled.update({ conditionBlock: blockNum }).exec();
    }

    return false;
  }
}
