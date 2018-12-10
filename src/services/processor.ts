import { IScheduled, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { Transaction } from './transaction';
import logger from './logger';

export class Processor {
  public static async process() {
    logger.info('Starting');

    const scheduled = await this.loadTransaction();
    const groups = this.groupBySenderAndChain(scheduled);

    logger.info(
      `Found ${scheduled.length} pending transactions in ${groups.size} groups`
    );
    groups.forEach((transactions, key) => this.dispatch(transactions, key));
  }

  private static inProgress: Set<string> = new Set<string>();

  private static async loadTransaction(): Promise<IScheduled[]> {
    return Scheduled.where('status', Status.Pending).exec();
  }

  private static async dispatch(transactions: IScheduled[], key: string) {
    if (!this.inProgress.has(key)) {
      this.inProgress.add(key);
      logger.info(`Starting with group ${key}`);
      await this.processTransactions(transactions);
      this.inProgress.delete(key);
    } else {
      logger.info(`Group ${key} still in progress`);
    }
  }

  private static groupBySenderAndChain(scheduled: IScheduled[]) {
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

  private static async processTransactions(scheduled: IScheduled[]) {
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

  private static async processTransaction(
    scheduled: IScheduled
  ): Promise<boolean> {
    const { transactionHash, status, error } = await Transaction.execute(
      scheduled
    );
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
