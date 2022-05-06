import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { IExecuteStatus, IScheduled, Status } from '../../models/Models';
import Scheduled from '../../models/ScheduledSchema';
import { SKIP_TX_BROADCAST } from '../../env';
import sendMail from '../mail';
import logger from './logger';
import { fetchTransactionMetadata, getSenderNextNonce, getProvider } from './utils';
import { gasService } from './gas';

const abi = ['function balanceOf(address) view returns (uint256)'];
const CONFIRMATIONS = 3;

interface IValidationResult {
  res: boolean;
  status?: IExecuteStatus;
  senderNonceHigher?: boolean;
}

export interface ITransactionExecutor {
  execute(scheduled: IScheduled, blockNum: number, transactionList?: IScheduled[]): Promise<IExecuteStatus>;
}
export class TransactionExecutor implements ITransactionExecutor {
  public static async getSenderNextNonce({ chainId, from }): Promise<number> {
    return getSenderNextNonce({ chainId, from });
  }

  private static queue: Set<string> = new Set<string>();

  public async execute(
    scheduled: IScheduled,
    blockNum: number,
    transactionList: IScheduled[],
  ): Promise<IExecuteStatus> {
    const id = scheduled._id.toString();
    if (TransactionExecutor.queue.has(id)) {
      logger.debug(`${id} Processing...`);
      return { status: Status.Pending };
    }

    TransactionExecutor.queue.add(id);
    try {
      return await this.executeTransaction(scheduled, blockNum, transactionList);
    } finally {
      TransactionExecutor.queue.delete(id);
    }
  }

  private async executeTransaction(
    scheduled: IScheduled,
    blockNum: number,
    transactionList: IScheduled[],
  ): Promise<IExecuteStatus> {
    const id = scheduled._id.toString();
    const provider = getProvider(scheduled.chainId);

    logger.debug(`${id} Checking execute conditions...`);

    const isWaitingForConfirmations = this.isWaitingForConfirmations(scheduled, blockNum);
    if (isWaitingForConfirmations.res) {
      return isWaitingForConfirmations.status!;
    }

    const hasCorrectNonce = await this.hasCorrectNonce(scheduled);
    if (hasCorrectNonce.senderNonceHigher) {
      await this.markTransactionsStale(scheduled, transactionList);
    }
    if (!hasCorrectNonce.res) {
      return hasCorrectNonce.status!;
    }

    const transaction = ethers.utils.parseTransaction(scheduled.signedTransaction);

    const networkTransaction = await provider.getTransaction(transaction.hash!);
    if (networkTransaction && networkTransaction.hash) {
      logger.debug(`${id} Already posted ${networkTransaction.hash}`);
      return this.pending;
    }

    const isConditionMet = await this.isConditionMet(scheduled, transaction, provider);
    let isGasPriceConditionMet = true;
    if (isConditionMet && scheduled.gasPriceAware) {
      logger.debug(`${id} checking gas price...`);
      isGasPriceConditionMet = await this.isGasPriceConditionMet(scheduled, transaction);
    }

    if (!(isConditionMet && isGasPriceConditionMet)) {
      logger.debug(`${id} Condition not met`);
      if (!isGasPriceConditionMet) {
        return {
          ...this.pending,
          executionAttempts: (scheduled.executionAttempts || 0) + 1,
          lastExecutionAttempt: new Date().toISOString(),
        };
      } else {
        return this.pending;
      }
    } else if (!scheduled.conditionBlock) {
      logger.debug(`${id} Condition met. Waiting for confirmations.`);
      return this.pending;
    }

    try {
      if (SKIP_TX_BROADCAST) {
        logger.debug(`${id} broadcasting disabled, marking as executed...`);
        scheduled.status = Status.Completed;
        const parsed = ethers.utils.parseTransaction(scheduled.signedTransaction);
        scheduled.transactionHash = parsed.hash;
        scheduled.executedAt = new Date().toISOString();
      } else {
        logger.debug(`${id} Executing...`);
        const response = await provider.sendTransaction(scheduled.signedTransaction);
        logger.debug(`${id} Sent ${response.hash}`);

        const receipt = await response.wait(CONFIRMATIONS);
        logger.debug(`${id} Confirmed ${receipt.transactionHash}`);

        scheduled.status = Status.Completed;
        scheduled.transactionHash = receipt.transactionHash;
        scheduled.executedAt = new Date().toISOString();
      }

      const { assetName, assetAmount, assetValue } = await fetchTransactionMetadata(scheduled);

      return {
        status: scheduled.status,
        transactionHash: scheduled.transactionHash,
        executedAt: scheduled.executedAt,
        assetName,
        assetAmount,
        assetValue,
      };
    } catch (e) {
      logger.error(`${id} ${e}`);
      return {
        status: Status.Error,
        transactionHash: e.transactionHash,
        error: e.toString(),
      };
    }
  }

  private isWaitingForConfirmations(scheduled: IScheduled, blockNum: number): IValidationResult {
    const isWaitingForConfirmations = scheduled.conditionBlock && scheduled.conditionBlock + CONFIRMATIONS > blockNum;

    if (isWaitingForConfirmations) {
      logger.debug(
        `${scheduled._id.toString()} Waiting for ${CONFIRMATIONS} confirmations. Condition met at ${
          scheduled.conditionBlock
        }, currently at ${blockNum} ${scheduled.nonce}`,
      );
      return {
        res: true,
        status: this.pending,
      };
    }

    return { res: false };
  }

  private async hasCorrectNonce(scheduled: IScheduled): Promise<IValidationResult> {
    const senderNonce = await TransactionExecutor.getSenderNextNonce(scheduled);

    logger.debug(`${scheduled._id} Sender nonce ${senderNonce} transaction nonce ${scheduled.nonce}`);

    if (senderNonce > scheduled.nonce) {
      logger.debug(`${scheduled._id} Transaction nonce already spent`);

      let status = Status.StaleNonce;

      // check if status in db has changed in the meantime
      // e.g. we just got tx confirmation
      const newScheduled = await Scheduled.findById(scheduled.id).exec();
      if (newScheduled.status > Status.Pending) {
        status = newScheduled.status;
      } else {
        // tx might've been just confirmed on chain so let's check that as well
        try {
          const provider = getProvider(scheduled.chainId);
          const txReceipt = await provider.getTransactionReceipt(scheduled.transactionHash);
          if (txReceipt.status === 1) {
            status = Status.Completed;
          } else if (txReceipt.status) {
            status = Status.Error;
          }
        } catch (e) {
          logger.error(e);
        }
      }

      return { res: false, status: { status }, senderNonceHigher: true };
    }

    if (senderNonce !== scheduled.nonce) {
      logger.debug(`${scheduled._id} Nonce does not match`);
      return { res: false, status: this.pending, senderNonceHigher: false };
    }

    return { res: true };
  }
  private async markTransactionsStale(scheduled: IScheduled, transactionList: IScheduled[]) {
    for (const transaction of transactionList) {
      if (transaction._id !== scheduled._id && transaction.nonce === scheduled.nonce) {
        transaction.status = Status.StaleNonce;
        transaction.update({ status: Status.StaleNonce }).exec();
      }
    }
  }

  private get pending() {
    return { status: Status.Pending };
  }

  private async isConditionMet(
    scheduled: IScheduled,
    transaction: ethers.Transaction,
    provider: ethers.providers.BaseProvider,
  ) {
    logger.debug(`${scheduled._id} Condition: asset=${scheduled.conditionAsset} amount=${scheduled.conditionAmount}`);

    let currentConditionAmount;

    try {
      const token = new ethers.Contract(transaction.to, abi, provider);
      currentConditionAmount = (await token.balanceOf(transaction.from)) as BigNumber;
    } catch (e) {
      currentConditionAmount = await provider.getBalance(transaction.from!);
    }

    const condition = ethers.BigNumber.from(scheduled.conditionAmount);
    const isStateConditionMet = ethers.BigNumber.from(currentConditionAmount).gte(condition);

    logger.debug(`${scheduled._id} Condition=${condition.toString()} Current=${currentConditionAmount.toString()}`);

    const currentTime = new Date().getTime();
    const timeCondition = scheduled.timeCondition || 0;
    const isTimeConditionMet = currentTime > timeCondition;

    logger.debug(
      `${scheduled._id} Time condition=${new Date(timeCondition).toISOString()} Current=${new Date(
        currentTime,
      ).toISOString()}`,
    );

    return isStateConditionMet && isTimeConditionMet;
  }

  private async isGasPriceConditionMet(scheduled: IScheduled, transaction: ethers.Transaction) {
    let isGasPriceConditionMet = true;
    if (scheduled.gasPriceAware) {
      const networkGasPrice = await gasService.getCurrentSafeLowGasPrice(scheduled.chainId);
      const txGasPrice = transaction.gasPrice;

      if (networkGasPrice.gt(txGasPrice)) {
        isGasPriceConditionMet = false;
        logger.debug(`${scheduled._id} 👎❌ TxGasPrice=${txGasPrice.toString()} Current=${networkGasPrice.toString()}`);

        const now = new Date().getTime();
        const minTimeDiffBetweenEmails = 1000 * 60 * 15; // 15 min
        const lastExecutionAttempt = new Date(scheduled.lastExecutionAttempt || 0).getTime();
        const shouldNotify = now - lastExecutionAttempt > minTimeDiffBetweenEmails;

        if (shouldNotify) {
          sendMail(
            // tslint:disable-next-line: no-object-literal-type-assertion
            {
              ...scheduled.toJSON(),
              networkGasPrice,
              txGasPrice,
            } as IScheduled,
            'delayed_gasPrice',
          );
        }
      } else {
        logger.debug(`${scheduled._id} 👍✅ TxGasPrice=${txGasPrice.toString()} Current=${networkGasPrice.toString()}`);
      }
    }

    return isGasPriceConditionMet;
  }
}
