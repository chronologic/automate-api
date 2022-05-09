import { ethers } from 'ethers';
import { groupBy } from 'lodash';

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

    try {
      const scheduleds = await this.scheduleService.getPending(AssetType.Ethereum);

      logger.debug(`Found ${scheduleds.length} pending transactions`);

      await this.processTransactions(scheduleds);
    } catch (e) {
      logger.error(e);
    }

    logger.info(`END processed`);
  }

  private async processTransactions(scheduleds: IScheduled[]): Promise<void> {
    const groupedByChain = this.groupByChain(scheduleds);
    const chainIds = Object.keys(groupedByChain).map(Number);

    logger.debug(`Processing transactions for ${chainIds.length} chains: ${chainIds.join(', ')}`);

    const promisesForChain = chainIds.map((chainId) =>
      this.processTransactionsForChain(chainId, groupedByChain[chainId]),
    );

    await Promise.all(promisesForChain);
  }

  private groupByChain(scheduleds: IScheduled[]): { [chainId: number]: IScheduled[] } {
    const groups = groupBy(scheduleds, 'chainId');

    const res = {};

    Object.keys(groups).forEach((key) => {
      res[Number(key)] = groups[key];
    });

    return res;
  }

  private async processTransactionsForChain(chainId: number, scheduleds: IScheduled[]): Promise<void> {
    const blockNum = await getBlockNumber(scheduleds[0].chainId);
    logger.debug(`Block number for chain ${chainId} is ${blockNum}`);

    const groupsForSender = this.groupBySender(scheduleds);
    const senders = Object.keys(groupsForSender);

    logger.debug(`Processing ${senders.length} groups for unique senders on chain ${chainId}`);

    const promisesForSender = senders.map((sender) =>
      this.processTransactionsForChainAndSender(groupsForSender[sender], blockNum),
    );

    await Promise.all(promisesForSender);
  }

  private groupBySender(scheduleds: IScheduled[]): { [address: string]: IScheduled[] } {
    return groupBy(scheduleds, 'from');
  }

  private async processTransactionsForChainAndSender(scheduleds: IScheduled[], blockNum: number) {
    const groupedByNonce = this.groupByNonce(scheduleds);
    const nonces = Object.keys(groupedByNonce);

    logger.debug(`Processing ${nonces.length} nonces for sender ${scheduleds[0].from}: ${nonces.join(', ')}`);

    for (const nonce of nonces) {
      const transactionsForNonce = groupedByNonce[nonce];
      logger.debug(`Processing ${transactionsForNonce.length} txs for sender ${scheduleds[0].from} and nonce ${nonce}`);

      const sortedByPriority = this.sortByPriority(transactionsForNonce);

      for (const transaction of sortedByPriority) {
        let executed = false;
        let conditionMet = false;
        logger.debug(`${transaction._id} nonce: ${transaction.nonce} priority: ${transaction.priority} processing...`);
        try {
          const res = await this.processTransaction(transaction, sortedByPriority, blockNum);
          executed = res.executed;
          conditionMet = res.conditionMet;
        } catch (e) {
          logger.error(`${transaction._id} processing failed with ${e}`);
        }
        logger.debug(
          `${transaction._id} nonce: ${transaction.nonce} priority: ${
            transaction.priority
          } processed with result ${JSON.stringify({
            executed,
            conditionMet,
          })}`,
        );
        if (conditionMet) {
          logger.debug(
            `${transaction._id} priority: ${transaction.priority} condition met; marking other priority txs as stale`,
          );
          await this.markOtherPriorityTransactionsStale(transaction, sortedByPriority);
          break;
        }
      }
    }
  }

  private groupByNonce(scheduleds: IScheduled[]): { [nonce: number]: IScheduled[] } {
    const groups = groupBy(scheduleds, 'nonce');

    const res = {};

    Object.keys(groups).forEach((key) => {
      res[Number(key)] = groups[key];
    });

    return res;
  }

  private sortByPriority(scheduled: IScheduled[]) {
    const sortedByPriority = scheduled.sort((a, b) => a.nonce - b.nonce || a.priority - b.priority);

    return sortedByPriority;
  }

  private async processTransaction(
    scheduled: IScheduled,
    transactionList: IScheduled[],
    blockNum: number,
  ): Promise<{ executed: boolean; conditionMet: boolean }> {
    const {
      transactionHash,
      conditionMet,
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

      return { executed: true, conditionMet };
    } else if (scheduled.conditionBlock === 0) {
      logger.info(`${scheduled._id} Starting confirmation tracker`);
      scheduled.update({ conditionBlock: blockNum }).exec();
    } else if (lastExecutionAttempt) {
      scheduled.update({ lastExecutionAttempt, executionAttempts }).exec();
    }

    return { executed: false, conditionMet };
  }

  private async markLowerPriorityTransactionsStale(executed: IScheduled, transactionList: IScheduled[]) {
    logger.debug(`Marking lower priority txs for ${executed._id} as stale`);
    for (const transaction of transactionList) {
      const isLowerPriority: boolean = transaction.priority > executed.priority;
      if (transaction._id !== executed._id && transaction.nonce === executed.nonce && isLowerPriority) {
        logger.debug(`Marking tx ${transaction._id} as stale`);
        transaction.update({ status: Status.StaleNonce }).exec();
      }
    }
  }

  private async markOtherPriorityTransactionsStale(executed: IScheduled, transactionList: IScheduled[]) {
    logger.debug(`Marking lower priority txs for ${executed._id} as stale`);
    for (const transaction of transactionList) {
      if (transaction._id !== executed._id && transaction.nonce === executed.nonce) {
        logger.debug(`Marking tx ${transaction._id} as stale`);
        transaction.update({ status: Status.StaleNonce }).exec();
      }
    }
  }
}
