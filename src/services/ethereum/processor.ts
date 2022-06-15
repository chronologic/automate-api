import { ethers } from 'ethers';
import { groupBy, mergeWith } from 'lodash';

import { AssetType, IScheduled, Status } from '../../models/Models';
import { IScheduleService } from '../schedule';
import sendMail from '../mail';
import tgBot from '../telegram';
import webhookService from '../webhook';
import { strategyService } from '../strategy';
import logger from './logger';
import { ITransactionExecutor } from './transaction';
import { fetchPriceStats, getBlockNumber } from './utils';

export class Processor {
  private scheduleService: IScheduleService;
  private transactionExecutor: ITransactionExecutor;
  constructor(scheduleService: IScheduleService, transactionExecutor: ITransactionExecutor) {
    this.scheduleService = scheduleService;
    this.transactionExecutor = transactionExecutor;
  }
  public async process() {
    logger.debug(`START processing...`);

    try {
      const scheduleds = await this.scheduleService.getPending(AssetType.Ethereum);

      logger.debug(`Found ${scheduleds.length} pending transactions`);

      if (scheduleds.length > 0) {
        await this.processTransactions(scheduleds);
      }
    } catch (e) {
      logger.error(e);
    }

    logger.debug(`END processed`);
  }

  public async processByIds(ids: string[]) {
    logger.info(`###DEBUG START processing...`);

    try {
      const scheduleds = await this.scheduleService.getByIds(AssetType.Ethereum, ids);

      logger.debug(`Found ${scheduleds.length} transactions for ids ${ids.join(', ')}`);

      await this.processTransactions(scheduleds);
    } catch (e) {
      logger.error(e);
    }

    logger.info(`###DEBUG END PROCESSED`);
  }

  private async processTransactions(scheduleds: IScheduled[]): Promise<void> {
    const groupedByChain = this.groupByChain(scheduleds);
    const chainIds = Object.keys(groupedByChain).map(Number);

    logger.debug(`Processing ${scheduleds.length} transactions for ${chainIds.length} chains: ${chainIds.join(', ')}`);

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
    const [firstNonce] = nonces;

    logger.debug(
      `Processing first nonce (${firstNonce}) out of ${nonces.length} nonces for sender ${
        scheduleds[0].from
      }: ${nonces.join(', ')}`,
    );

    const transactionsForNonce = groupedByNonce[firstNonce];
    logger.debug(
      `Processing ${transactionsForNonce.length} txs for sender ${scheduleds[0].from} and nonce ${firstNonce}`,
    );

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
    let executed = false;
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
      conditionBlock,
    } = await this.transactionExecutor.execute(scheduled, blockNum, transactionList);

    const isStrategyTx = !!scheduled.strategyInstanceId;
    if (isStrategyTx && status === Status.StaleNonce) {
      await strategyService.shiftTimeCondition(scheduled);
    }

    if (status !== Status.Pending) {
      logger.info(`${scheduled._id} processed with status ${Status[status]}`);

      const priceStats = await fetchPriceStats(ethers.utils.parseTransaction(scheduled.signedTransaction));
      const gasPaid = priceStats.gasPaid || scheduled.gasSaved;
      const gasSaved = scheduled.gasSaved > priceStats.gasSaved ? scheduled.gasSaved : priceStats.gasSaved;

      const merged: IScheduled = {
        ...mergeWith(
          scheduled.toObject(),
          // tslint:disable-next-line: no-object-literal-type-assertion
          {
            transactionHash,
            status,
            error,
            executedAt,
            assetName,
            assetAmount,
            assetValue,
            executionAttempts,
            lastExecutionAttempt,
            conditionBlock,
            gasPrice: priceStats.txGasPrice,
          } as IScheduled,
          (scheduledValue, resValue) => {
            return resValue || scheduledValue;
          },
        ),
        gasPaid,
        gasSaved,
      };

      await scheduled.update(merged).exec();

      const isSuccess = status === Status.Completed;
      const isError = status === Status.Error;
      executed = isSuccess || isError;

      if (executed) {
        sendMail(
          // tslint:disable-next-line: no-object-literal-type-assertion
          merged,
          error ? 'failure' : 'success',
        );
      }

      if (isSuccess) {
        tgBot.executed({ value: merged.assetValue, savings: gasSaved });
        webhookService.notify(merged);
      }

      return { executed, conditionMet };
    } else if (scheduled.conditionBlock === 0) {
      logger.info(`${scheduled._id} Starting confirmation tracker`);
      scheduled.update({ conditionBlock: blockNum }).exec();
    } else if (lastExecutionAttempt) {
      scheduled.update({ lastExecutionAttempt, executionAttempts }).exec();
    }

    return { executed, conditionMet };
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
