import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { IExecuteStatus, IScheduled, Status } from '../../models/Models';
import logger from './logger';
import { fetchTransactionMetadata, getSenderNextNonce, fetchNetworkGasPrice } from './utils';
import sendMail from '../mail';
import { SKIP_TX_BROADCAST } from '../../env';

const abi = ['function balanceOf(address) view returns (uint256)'];
const CONFIRMATIONS = 3;

interface IValidationResult {
  res: boolean;
  status?: IExecuteStatus;
}

export interface ITransactionExecutor {
  execute(scheduled: IScheduled, blockNum: number): Promise<IExecuteStatus>;
}
export class TransactionExecutor implements ITransactionExecutor {
  public static async getSenderNextNonce({ chainId, from }): Promise<number> {
    return getSenderNextNonce({ chainId, from });
  }

  private static queue: Set<string> = new Set<string>();

  public async execute(scheduled: IScheduled, blockNum: number): Promise<IExecuteStatus> {
    const id = scheduled._id.toString();

    if (TransactionExecutor.queue.has(id)) {
      logger.info(`${id} Processing...`);
      return { status: Status.Pending };
    }

    TransactionExecutor.queue.add(id);
    try {
      return await this.executeTransaction(scheduled, blockNum);
    } finally {
      TransactionExecutor.queue.delete(id);
    }
  }

  private async executeTransaction(scheduled: IScheduled, blockNum: number): Promise<IExecuteStatus> {
    const id = scheduled._id.toString();
    const provider = this.getProvider(scheduled.chainId);

    logger.info(`${id} Checking execute conditions...`);

    const isWaitingForConfirmations = this.isWaitingForConfirmations(scheduled, blockNum);
    if (isWaitingForConfirmations.res) {
      return isWaitingForConfirmations.status!;
    }

    const hasCorrectNonce = await this.hasCorrectNonce(scheduled);
    if (!hasCorrectNonce.res) {
      return hasCorrectNonce.status!;
    }

    const transaction = ethers.utils.parseTransaction(scheduled.signedTransaction);

    const networkTransaction = await provider.getTransaction(transaction.hash!);
    if (networkTransaction && networkTransaction.hash) {
      logger.info(`${id} Already posted ${networkTransaction.hash}`);
      return this.pending;
    }

    const isConditionMet = await this.isConditionMet(scheduled, transaction, provider);
    let isGasPriceConditionMet = true;
    if (isConditionMet && scheduled.gasPriceAware) {
      logger.info(`${id} checking gas price...`);
      isGasPriceConditionMet = await this.isGasPriceConditionMet(scheduled, transaction);
    }

    if (!(isConditionMet && isGasPriceConditionMet)) {
      logger.info(`${id} Condition not met`);
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
      logger.info(`${id} Condition met. Waiting for confirmations.`);
      return this.pending;
    }

    try {
      if (SKIP_TX_BROADCAST) {
        logger.info(`${id} broadcasting disabled, marking as executed...`);
        scheduled.status = Status.Completed;
        const parsed = ethers.utils.parseTransaction(scheduled.signedTransaction);
        scheduled.transactionHash = parsed.hash;
        scheduled.executedAt = new Date().toISOString();
      } else {
        logger.info(`${id} Executing...`);
        const response = await provider.sendTransaction(scheduled.signedTransaction);
        logger.info(`${id} Sent ${response.hash}`);

        const receipt = await response.wait(CONFIRMATIONS);
        logger.info(`${id} Confirmed ${receipt.transactionHash}`);

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

  private getProvider(chainId: number) {
    const network = ethers.utils.getNetwork(chainId);
    return ethers.getDefaultProvider(network);
  }

  private isWaitingForConfirmations(scheduled: IScheduled, blockNum: number): IValidationResult {
    const isWaitingForConfirmations = scheduled.conditionBlock && scheduled.conditionBlock + CONFIRMATIONS > blockNum;

    if (isWaitingForConfirmations) {
      logger.info(
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

    logger.info(`${scheduled._id} Sender nonce ${senderNonce} transaction nonce ${scheduled.nonce}`);

    if (senderNonce > scheduled.nonce) {
      logger.info(`${scheduled._id} Transaction nonce already spent`);
      return { res: false, status: { status: Status.StaleNonce } };
    }

    if (senderNonce !== scheduled.nonce) {
      logger.info(`${scheduled._id} Nonce does not match`);
      return { res: false, status: this.pending };
    }

    return { res: true };
  }

  private get pending() {
    return { status: Status.Pending };
  }

  private async isConditionMet(
    scheduled: IScheduled,
    transaction: ethers.utils.Transaction,
    provider: ethers.providers.BaseProvider,
  ) {
    logger.info(`${scheduled._id} Condition: asset=${scheduled.conditionAsset} amount=${scheduled.conditionAmount}`);

    let currentConditionAmount;

    try {
      const token = new ethers.Contract(transaction.to, abi, provider);
      currentConditionAmount = (await token.balanceOf(transaction.from)) as BigNumber;
    } catch (e) {
      currentConditionAmount = await provider.getBalance(transaction.from!);
    }

    const condition = new BigNumber(scheduled.conditionAmount);
    const isStateConditionMet = new BigNumber(currentConditionAmount).gte(condition);

    logger.info(`${scheduled._id} Condition=${condition.toString()} Current=${currentConditionAmount.toString()}`);

    const currentTime = new Date().getTime();
    const timeCondition = scheduled.timeCondition || 0;
    const isTimeConditionMet = currentTime > timeCondition;

    logger.info(
      `${scheduled._id} Time condition=${new Date(timeCondition).toISOString()} Current=${new Date(
        currentTime,
      ).toISOString()}`,
    );

    return isStateConditionMet && isTimeConditionMet;
  }

  private async isGasPriceConditionMet(scheduled: IScheduled, transaction: ethers.utils.Transaction) {
    let isGasPriceConditionMet = true;
    if (scheduled.gasPriceAware) {
      const networkGasPrice = await fetchNetworkGasPrice(scheduled.chainId);
      const txGasPrice = transaction.gasPrice;

      if (networkGasPrice.gt(txGasPrice)) {
        isGasPriceConditionMet = false;
        logger.info(`${scheduled._id} 👎❌ TxGasPrice=${txGasPrice.toString()} Current=${networkGasPrice.toString()}`);

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
        logger.info(`${scheduled._id} 👍✅ TxGasPrice=${txGasPrice.toString()} Current=${networkGasPrice.toString()}`);
      }
    }

    return isGasPriceConditionMet;
  }
}
