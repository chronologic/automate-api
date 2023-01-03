import { ethers } from 'ethers';

import { IExecuteStatus, IScheduled, Status } from '../../models/Models';
import Scheduled from '../../models/ScheduledSchema';
import { SKIP_TX_BROADCAST } from '../../env';
import sendMail from '../mail';
import logger from './logger';
import { getSenderNextNonce, getProvider, retryRpcCallOnIntermittentError, decodeTxGasParams } from './utils';
import { gasService } from './gas';

const abi = ['function balanceOf(address) view returns (uint256)'];
const CONFIRMATIONS = 3;

interface IValidationResult {
  res: boolean;
  executeStatus?: IExecuteStatus;
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
      logger.debug(`${id} already processing...`);
      return { status: Status.Pending, conditionMet: false };
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
      return isWaitingForConfirmations.executeStatus!;
    }

    const isTransactionAlreadyPosted = await this.isTransactionAlreadyPosted(scheduled);
    if (isTransactionAlreadyPosted.res) {
      return await this.confirmTransaction(scheduled);
    }

    const hasCorrectNonce = await this.hasCorrectNonce(scheduled);
    if (hasCorrectNonce.res) {
      // nonce is correct
    } else {
      return hasCorrectNonce.executeStatus!;
    }

    const isTimeConditionMet = await this.isTimeConditionMet(scheduled);
    if (isTimeConditionMet.res) {
      // time condition met
    } else {
      return isTimeConditionMet.executeStatus!;
    }

    const isAmountConditionMet = await this.isAmountConditionMet(scheduled);
    if (isAmountConditionMet.res) {
      // amount condition met
    } else {
      return isAmountConditionMet.executeStatus!;
    }

    const isGasPriceConditionMet = await this.isGasPriceConditionMet(scheduled);
    if (isGasPriceConditionMet.res) {
      // gas price condition met
    } else {
      return isGasPriceConditionMet.executeStatus!;
    }

    logger.info(`${id} ✅✅✅ all conditions met`);

    try {
      if (SKIP_TX_BROADCAST) {
        logger.debug(`${id} broadcasting disabled, marking as executed...`);
        const parsed = ethers.utils.parseTransaction(scheduled.signedTransaction);

        return {
          status: Status.Completed,
          transactionHash: parsed.hash,
          executedAt: new Date().toISOString(),
          conditionBlock: blockNum,
        };
      } else {
        logger.info(`${id} Executing...`);
        const response = await retryRpcCallOnIntermittentError(() =>
          provider.sendTransaction(scheduled.signedTransaction),
        );
        logger.info(`${id} Sent ${response.hash}`);

        return await this.confirmTransaction(scheduled);
      }
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
        `${scheduled._id.toString()} Waiting for ${CONFIRMATIONS} confirmations. Condition will be met at block ${
          scheduled.conditionBlock
        }, currently at ${blockNum}`,
      );
      return {
        res: true,
        executeStatus: { ...this.pending, conditionMet: true },
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
          const txReceipt = await retryRpcCallOnIntermittentError(() =>
            provider.getTransactionReceipt(scheduled.transactionHash),
          );

          if (txReceipt?.status === 1) {
            status = Status.Completed;
          } else if (txReceipt?.status) {
            status = Status.Error;
          }
        } catch (e) {
          logger.error(e);
        }
      }

      logger.debug(`Nonce check status for tx ${scheduled._id} is ${Status[status]}`);

      return { res: false, executeStatus: { status }, senderNonceHigher: true };
    }

    if (senderNonce !== scheduled.nonce) {
      logger.debug(`${scheduled._id} Nonce does not match`);
      return { res: false, executeStatus: this.pending, senderNonceHigher: false };
    }

    return { res: true };
  }

  private async isTransactionAlreadyPosted(scheduled: IScheduled): Promise<IValidationResult> {
    const transaction = ethers.utils.parseTransaction(scheduled.signedTransaction);
    const provider = getProvider(transaction.chainId);

    const networkTransaction = await retryRpcCallOnIntermittentError(() => provider.getTransaction(transaction.hash!));
    if (networkTransaction && networkTransaction.hash) {
      logger.debug(`${scheduled.id} Already posted ${networkTransaction.hash}`);
      return { res: true, executeStatus: this.pending };
    }

    return { res: false };
  }

  private async confirmTransaction(scheduled: IScheduled): Promise<IExecuteStatus> {
    const transaction = ethers.utils.parseTransaction(scheduled.signedTransaction);
    const provider = getProvider(transaction.chainId);

    const receipt = await provider.waitForTransaction(transaction.hash, CONFIRMATIONS);

    const txStatusFailed = 0;
    const status = receipt.status === txStatusFailed ? Status.Error : Status.Completed;

    logger.info(`${scheduled.id} ✅✅✅ Confirmed ${receipt.transactionHash} with status ${status}`);

    return {
      status,
      transactionHash: receipt.transactionHash,
      executedAt: new Date().toISOString(),
      conditionBlock: receipt.blockNumber,
      conditionMet: true,
    };
  }

  private async isAmountConditionMet(scheduled: IScheduled): Promise<IValidationResult> {
    const transaction = ethers.utils.parseTransaction(scheduled.signedTransaction);
    const provider = getProvider(transaction.chainId);

    let isAmountConditionMet = false;

    if (scheduled.conditionAmount) {
      logger.debug(`${scheduled._id} Condition: asset=${scheduled.conditionAsset} amount=${scheduled.conditionAmount}`);

      let networkAmount;

      try {
        if (scheduled.conditionAsset === 'eth') {
          throw new Error('Skip token check');
        }
        const token = new ethers.Contract(transaction.to, abi, provider);
        networkAmount = await retryRpcCallOnIntermittentError(() => token.balanceOf(transaction.from));
      } catch (e) {
        networkAmount = await retryRpcCallOnIntermittentError(() => provider.getBalance(transaction.from!));
      }

      const condition = ethers.BigNumber.from(scheduled.conditionAmount);
      isAmountConditionMet = ethers.BigNumber.from(networkAmount).gte(condition);

      logger.debug(
        `${scheduled._id} ${
          isAmountConditionMet ? '✅' : '❌'
        } amount condition (condition=${condition.toString()} Current=${networkAmount.toString()})`,
      );
    } else {
      isAmountConditionMet = true;
      logger.debug(`${scheduled._id} no condition amount`);
    }

    if (isAmountConditionMet) {
      return { res: true };
    }

    return { res: false, executeStatus: this.pending };
  }

  private async isTimeConditionMet(scheduled: IScheduled): Promise<IValidationResult> {
    let isTimeConditionMet = false;

    if (scheduled.timeCondition) {
      const currentTime = new Date().getTime();
      const timeCondition = scheduled.timeCondition || 0;
      isTimeConditionMet = currentTime > timeCondition;

      logger.debug(
        `${scheduled._id} ${isTimeConditionMet ? '✅' : '❌'} time condition (condition=${new Date(
          timeCondition,
        ).toISOString()} Current=${new Date(currentTime).toISOString()})`,
      );
    } else {
      isTimeConditionMet = true;
      logger.debug(`${scheduled._id} no time condition`);
    }

    if (isTimeConditionMet) {
      return { res: true };
    }

    return { res: false, executeStatus: this.pending };
  }

  private async markTransactionsStale(scheduled: IScheduled, transactionList: IScheduled[]) {
    logger.debug(`Marking ${transactionList.length} txs for ${scheduled._id} as stale`);
    for (const transaction of transactionList) {
      if (transaction._id !== scheduled._id && transaction.nonce === scheduled.nonce) {
        logger.debug(`Marking tx ${transaction._id} as stale`);
        transaction.update({ status: Status.StaleNonce }).exec();
      }
    }
  }

  private get pending() {
    return { status: Status.Pending };
  }

  private async isGasPriceConditionMet(scheduled: IScheduled): Promise<IValidationResult> {
    const transaction = ethers.utils.parseTransaction(scheduled.signedTransaction);

    let isGasPriceConditionMet = false;

    if (scheduled.gasPriceAware) {
      const networkGasPrice = await gasService.getCurrentSafeLowGasPrice(scheduled.chainId);
      const { combinedGasPrice: txGasPrice } = decodeTxGasParams(transaction);

      if (networkGasPrice.gt(txGasPrice)) {
        isGasPriceConditionMet = false;
        logger.debug(`${scheduled._id} ❌ TxGasPrice=${txGasPrice.toString()} Current=${networkGasPrice.toString()}`);

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
        isGasPriceConditionMet = true;
        logger.debug(`${scheduled._id} ✅ TxGasPrice=${txGasPrice.toString()} Current=${networkGasPrice.toString()}`);
      }
    } else {
      isGasPriceConditionMet = true;
      logger.debug(`${scheduled._id} not gas price aware, assuming gas price condition met`);
    }

    if (isGasPriceConditionMet) {
      return { res: true };
    }

    return {
      res: false,
      executeStatus: {
        ...this.pending,
        executionAttempts: (scheduled.executionAttempts || 0) + 1,
        lastExecutionAttempt: new Date().toISOString(),
      },
    };
  }
}
