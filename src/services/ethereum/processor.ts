import { ethers } from 'ethers';

import { AssetType, IScheduled, Status } from '../../models/Models';
import { IScheduleService } from '../schedule';
import sendMail from '../mail';
import logger from './logger';
import { ITransactionExecutor } from './transaction';
import { fetchPriceStats, getBlockNumber } from './utils';
import tgBot from '../telegram';
import webhookService from '../webhook';

export class Processor {
  private scheduleService: IScheduleService;
  private transactionExecutor: ITransactionExecutor;
  constructor(scheduleService: IScheduleService, transactionExecutor: ITransactionExecutor) {
    this.scheduleService = scheduleService;
    this.transactionExecutor = transactionExecutor;
  }
  public async process() {
    logger.info(`START processing...`);

    const scheduleds = await this.scheduleService.getPending(AssetType.Ethereum);
    const groups = this.groupBySenderAndChain(scheduleds);

    logger.debug(`Found ${scheduleds.length} pending transactions in ${groups.size} groups`);

    const inProgress = [];
    groups.forEach((transactions) => inProgress.push(this.processTransactions(transactions)));

    await Promise.all(inProgress);

    logger.info(`END processed`);
  }

  private groupBySenderAndChain(scheduled: IScheduled[]) {
    const makeKey = (sender: string, chainId: number) => `${sender}-${chainId.toString()}`;
    const groups: Map<string, IScheduled[]> = new Map<string, IScheduled[]>();

    scheduled.forEach((s) => {
      const key = makeKey(s.from, s.chainId);
      if (s.priority === undefined) {
        s.priority = 1;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(s);
    });

    return groups;
  }
  private sortByPriority(scheduled: IScheduled[]) {
    const sortedByPriority = scheduled.sort((a, b) => a.nonce - b.nonce || a.priority - b.priority);

    return sortedByPriority;
  }

  private async processTransactions(scheduleds: IScheduled[]) {
    const sortedByPriority = this.sortByPriority(scheduleds);
    const blockNum = await getBlockNumber(scheduleds[0].chainId);

    for (const transaction of sortedByPriority) {
      let res = false;
      try {
        res = await this.processTransaction(transaction, sortedByPriority, blockNum);
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
    transactionList: IScheduled[],
    blockNum: number,
  ): Promise<boolean> {
    const {
      transactionHash,
      status,
      error,
      executedAt,
      assetName,
      assetAmount,
      assetValue,
      executionAttempts,
      lastExecutionAttempt,
    } = await this.transactionExecutor.execute(scheduled, blockNum, transactionList);
    if (status !== Status.Pending) {
      logger.info(`${scheduled._id} Completed with status ${Status[status]}`);

      const priceStats = await fetchPriceStats(ethers.utils.parseTransaction(scheduled.signedTransaction));
      const gasPaid = priceStats.gasPaid || scheduled.gasSaved;
      const gasSaved = scheduled.gasSaved > priceStats.gasSaved ? scheduled.gasSaved : priceStats.gasSaved;

      scheduled
        .update({
          transactionHash,
          status,
          error,
          executedAt,
          assetName,
          assetAmount,
          assetValue,
          executedEthPrice: priceStats.ethPrice,
          executedGasPrice: priceStats.gasPrice,
          gasPaid,
          gasSaved,
        })
        .exec();

      sendMail(
        // tslint:disable-next-line: no-object-literal-type-assertion
        {
          ...scheduled.toJSON(),
          transactionHash,
          status,
          error,
          executedAt,
          assetName: assetName || scheduled.assetName,
          assetAmount: assetAmount || scheduled.assetAmount,
          assetValue: assetValue || scheduled.assetValue,
        } as IScheduled,
        error ? 'failure' : 'success',
      );

      tgBot.executed({ value: assetValue, savings: gasSaved });
      webhookService.notify({ ...scheduled.toJSON(), status, gasPaid, gasSaved } as IScheduled);

      await this.markLowerPriorityTransactionsStale(scheduled, transactionList);
      return true;
    } else if (scheduled.conditionBlock === 0) {
      logger.info(`${scheduled._id} Starting confirmation tracker`);
      scheduled.update({ conditionBlock: blockNum }).exec();
    } else if (lastExecutionAttempt) {
      scheduled.update({ lastExecutionAttempt, executionAttempts }).exec();
    }

    return false;
  }

  private async markLowerPriorityTransactionsStale(executed: IScheduled, transactionList: IScheduled[]) {
    for (const transaction of transactionList) {
      const isLowerPriority: boolean = transaction.priority > executed.priority;
      if (transaction._id !== executed._id && transaction.nonce === executed.nonce && isLowerPriority) {
        transaction.update({ status: Status.StaleNonce }).exec();
      }
    }
  }
}
