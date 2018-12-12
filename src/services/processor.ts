import { IScheduled, Status } from '../models/Models';
import { ITransactionExecutor } from './transaction';
import logger from './logger';
import { IScheduleService } from './schedule';

export class Processor {
  private _scheduleService: IScheduleService;
  private _transactionExecutor: ITransactionExecutor;

  constructor(
    scheduleService: IScheduleService,
    transactionExecutor: ITransactionExecutor
  ) {
    this._scheduleService = scheduleService;
    this._transactionExecutor = transactionExecutor;
  }

  public async process() {
    logger.info('Starting');

    const scheduled = await this._scheduleService.getPending();
    const groups = this.groupBySenderAndChain(scheduled);

    logger.info(
      `Found ${scheduled.length} pending transactions in ${groups.size} groups`
    );
    groups.forEach((transactions, key) => this.dispatch(transactions, key));
  }

  private async dispatch(transactions: IScheduled[], key: string) {
    logger.info(`Starting with group ${key}`);
    await this.processTransactions(transactions);
  }

  private groupBySenderAndChain(scheduled: IScheduled[]) {
    const mkKey = (sender: string, chainId: number) =>
      sender + chainId.toString();
    const groups: Map<string, IScheduled[]> = new Map<string, IScheduled[]>();

    scheduled.forEach(s => {
      const key = mkKey(s.from, s.chainId);

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(s);
    });

    return groups;
  }

  private async processTransactions(scheduled: IScheduled[]) {
    const sorted = scheduled.sort((a, b) => a.nonce - b.nonce);

    for (const transaction of sorted) {
      let res = false;
      try {
        res = await this.processTransaction(transaction);
      } catch (e) {
        logger.error(`Processing ${transaction._id} failed with ${e}`);
      }
      if (!res) break;
    }
  }

  private async processTransaction(scheduled: IScheduled): Promise<boolean> {
    const {
      transactionHash,
      status,
      error
    } = await this._transactionExecutor.execute(scheduled);
    if (status != Status.Pending) {
      logger.info(
        `Transaction ${scheduled._id} completed with status ${Status[status]}`
      );
      scheduled.update({ transactionHash, status, error }).exec();

      return true;
    }

    return false;
  }
}
