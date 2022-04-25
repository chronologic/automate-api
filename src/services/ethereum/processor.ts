import { ethers } from 'ethers';

import { AssetType, IScheduled, Status } from '../../models/Models';
import { IScheduleService } from '../schedule';
import sendMail from '../mail';
import logger from './logger';
import { ITransactionExecutor } from './transaction';
import { fetchPriceStats } from './utils';
import tgBot from '../telegram';
import webhookService from '../webhook';

export class Processor {
  private scheduleService: IScheduleService;
  private transactionExecutor: ITransactionExecutor;

  constructor(scheduleService: IScheduleService, transactionExecutor: ITransactionExecutor) {
    this.scheduleService = scheduleService;
    this.transactionExecutor = transactionExecutor;
  }

  public async process(blockNum: number) {
    logger.info(`Processing block ${blockNum}...`);

    const scheduled = await this.scheduleService.getPending(AssetType.Ethereum);
    const groups = this.groupBySenderAndChain(scheduled);

    logger.debug(`Found ${scheduled.length} pending transactions in ${groups.size} groups`);

    const inProgress = [];
    groups.forEach((transactions) => inProgress.push(this.processTransactions(transactions, blockNum)));

    return Promise.all(inProgress);
  }

  private groupBySenderAndChain(scheduled: IScheduled[]) {
    const makeKey = (sender: string, chainId: number) => `${sender}-${chainId.toString()}`;
    const groups: Map<string, IScheduled[]> = new Map<string, IScheduled[]>();

    scheduled.forEach((s) => {
      const key = makeKey(s.from, s.chainId);
      if (s.priority === undefined) {
        s.priority = Math.floor(Math.random() * 10);
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(s);
    });

    return groups;
  }
  private groupByPriority(scheduled: IScheduled[]) {
    const sortedByPriority = scheduled.sort((a, b) => a.nonce - b.nonce || a.priority - b.priority);

    return sortedByPriority;
  }

  private async processTransactions(scheduled: IScheduled[], blockNum: number) {
    const sortedByPriority = this.groupByPriority(scheduled);

    for (const transaction of sortedByPriority) {
      let res = false;
      try {
        res = await this.processTransaction(transaction, blockNum, sortedByPriority);
      } catch (e) {
        logger.error(`Processing ${transaction._id} failed with ${e}`);
        // tslint:disable-next-line: no-console
        // console.log(e);
      }
      if (!res) {
        break;
      }
    }
  }

  private async processTransaction(
    scheduled: IScheduled,
    blockNum: number,
    transactonList: IScheduled[],
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
    } = await this.transactionExecutor.execute(scheduled, blockNum, transactonList);
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
      await this.markLowerPriorityTransactions(scheduled, transactonList);
      return true;
    } else if (scheduled.conditionBlock === 0) {
      logger.info(`${scheduled._id} Starting confirmation tracker`);
      scheduled.update({ conditionBlock: blockNum }).exec();
    } else if (lastExecutionAttempt) {
      scheduled.update({ lastExecutionAttempt, executionAttempts }).exec();
    }

    return false;
  }

  private async markLowerPriorityTransactions(scheduled: IScheduled, transactonList: IScheduled[]) {
    for (const transaction of transactonList) {
      if (
        transaction._id !== scheduled._id &&
        transaction.nonce === scheduled.nonce &&
        transaction.priority > scheduled.priority
      ) {
        transaction.status = Status.StaleNonce;
      }
    }
  }
}
