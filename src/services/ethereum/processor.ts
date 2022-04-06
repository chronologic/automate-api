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
    const scheduled: IScheduled[] = await this.scheduleService.getPending(AssetType.Ethereum);
    const makeKey = (sender: string, chainId: number) => `${sender}-${chainId.toString()}`;
    const groups: Map<string, IScheduled[]> = new Map<string, IScheduled[]>();
    scheduled.forEach((schedule: IScheduled) => {
      const key: string = makeKey(schedule.from, schedule.chainId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(schedule);
    });
    logger.debug(`Found ${scheduled.length} pending transactions in ${groups.size} groups`);
    const inProgress = [];
    groups.forEach((transactions) => inProgress.push(this.processTransactions(transactions, blockNum)));
    return Promise.all(inProgress);
  }

  private async processTransactions(scheduled: IScheduled[], blockNum: number) {
    const sorted: IScheduled[] = scheduled.sort((a, b) => a.nonce - b.nonce); // if a or b is not NaN or Inf (check this!)
    for (const transaction of sorted) {
      let res: boolean = false;
      try {
        const {
          status,
          transactionHash,
          error,
          executedAt,
          assetName,
          assetAmount,
          assetValue,
          executionAttempts,
          lastExecutionAttempt,
        } = await this.transactionExecutor.execute(transaction, blockNum);
        if (status !== Status.Pending) {
          const priceStats = await fetchPriceStats(ethers.utils.parseTransaction(transaction.signedTransaction));
          const gasPaid = priceStats.gasPaid || transaction.gasSaved;
          const gasSaved = transaction.gasSaved > priceStats.gasSaved ? transaction.gasSaved : priceStats.gasSaved;
          transaction
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
              ...transaction.toJSON(),
              transactionHash,
              status,
              error,
              executedAt,
              assetName: assetName || transaction.assetName,
              assetAmount: assetAmount || transaction.assetAmount,
              assetValue: assetValue || transaction.assetValue,
            } as IScheduled,
            error ? 'failure' : 'success',
          );

          tgBot.executed({ value: assetValue, savings: gasSaved });
          webhookService.notify({ ...transaction.toJSON(), status, gasPaid, gasSaved } as IScheduled);
          res = true;
        } else if (transaction.conditionBlock === 0) {
          transaction.update({ conditionBlock: blockNum }).exec();
        } else if (lastExecutionAttempt) {
          transaction.update({ lastExecutionAttempt, executionAttempts }).exec();
        }
        logger.debug(`Processing ${transaction._id} true with res ${res}`);
      } catch (e) {
        logger.error(`Processing ${transaction._id} failed with ${e}`);
      }
      if (!res) {
        logger.debug(`res false is ${res} `);
        break;
      }
    }
  }
}
