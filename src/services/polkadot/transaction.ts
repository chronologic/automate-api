import { ApiPromise } from '@polkadot/api';
import BigNumber from 'bignumber.js';

import { IExecuteStatus, IScheduled, Status } from '../../models/Models';
import getApi from './api';
import logger from './logger';
import { fetchTransactionMetadata, getNextNonce, txToExtrinsic } from './utils';

interface IValidationResult {
  res: boolean;
  status?: IExecuteStatus;
}

export interface ITransactionExecutor {
  execute(scheduled: IScheduled, blockNum: number): Promise<IExecuteStatus>;
}
export class TransactionExecutor implements ITransactionExecutor {
  public static async getSenderNextNonce(from: string): Promise<number> {
    return getNextNonce(from);
  }

  private static queue: Set<string> = new Set<string>();

  public async execute(
    scheduled: IScheduled,
    blockNum: number,
  ): Promise<IExecuteStatus> {
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

  private async executeTransaction(
    scheduled: IScheduled,
    blockNum: number,
  ): Promise<IExecuteStatus> {
    const id = scheduled._id.toString();
    const api = await getApi();
    logger.info(`${id} Executing...`);

    // const isWaitingForConfirmations = this.isWaitingForConfirmations(
    //   scheduled,
    //   blockNum,
    // );
    // if (isWaitingForConfirmations.res) {
    //   return isWaitingForConfirmations.status!;
    // }

    const hasCorrectNonce = await this.hasCorrectNonce(scheduled);
    if (!hasCorrectNonce.res) {
      return hasCorrectNonce.status!;
    }

    // TODO: figure out a way to check if a tx is already submitted
    // const networkTransaction = await provider.getTransaction(transaction.hash!);
    // if (networkTransaction && networkTransaction.hash) {
    //   logger.info(`${id} Already posted ${networkTransaction.hash}`);
    //   return this.pending;
    // }

    const isConditionMet = await this.isConditionMet(scheduled, api);
    if (!isConditionMet) {
      logger.info(`${id} Condition not met`);
      return this.pending;
    } else if (!scheduled.conditionBlock) {
      logger.info(`${id} Condition met. Waiting for confirmations.`);
      return this.pending;
    }

    try {
      const hash = await this.sendTx(api, scheduled.signedTransaction);
      // logger.info(`${id} Sent ${hash.toString()}`);

      // const receipt = await response.wait(CONFIRMATIONS);
      // logger.info(`${id} Confirmed ${receipt.transactionHash}`);

      scheduled.status = Status.Completed;
      scheduled.transactionHash = hash;
      scheduled.executedAt = new Date().toISOString();

      const {
        assetName,
        assetAmount,
        assetValue,
      } = await fetchTransactionMetadata(scheduled);

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

  private async sendTx(api: ApiPromise, tx: string): Promise<string> {
    const extrinsic: any = await txToExtrinsic(tx);
    return new Promise((resolve, reject) => {
      api.rpc.author.submitAndWatchExtrinsic(extrinsic, (result: any) => {
        if (result.isFinalized) {
          return resolve(extrinsic.hash.toString());
        } else if (result.isDropped || result.isInvalid) {
          return reject(result.type);
        }
      });
    });
  }

  // private isWaitingForConfirmations(
  //   scheduled: IScheduled,
  //   blockNum: number,
  // ): IValidationResult {
  //   const isWaitingForConfirmations =
  //     scheduled.conditionBlock &&
  //     scheduled.conditionBlock + CONFIRMATIONS > blockNum;

  //   if (isWaitingForConfirmations) {
  //     logger.info(
  //       `${scheduled._id.toString()} Waiting for ${CONFIRMATIONS} confirmations. Condition will be met at ${
  //         scheduled.conditionBlock
  //       }, currently at ${blockNum} ${scheduled.nonce}`,
  //     );
  //     return {
  //       res: true,
  //       status: this.pending,
  //     };
  //   }

  //   return { res: false };
  // }

  private async hasCorrectNonce(
    scheduled: IScheduled,
  ): Promise<IValidationResult> {
    const senderNonce = await TransactionExecutor.getSenderNextNonce(
      scheduled.from,
    );

    logger.info(
      `${scheduled._id} Sender nonce ${senderNonce} transaction nonce ${scheduled.nonce}`,
    );

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

  private async isConditionMet(scheduled: IScheduled, api: ApiPromise) {
    logger.info(
      `${scheduled._id} Condition: asset=${scheduled.conditionAsset} amount=${scheduled.conditionAmount}`,
    );

    const currentConditionAmount = new BigNumber(
      (await api.query.balances.freeBalance(scheduled.from!)).toString(),
    );
    const condition = new BigNumber(scheduled.conditionAmount);
    const isStateConditionMet = currentConditionAmount.gte(condition);

    logger.info(
      `${
        scheduled._id
      } Condition=${condition.toString()} Current=${currentConditionAmount.toString()}`,
    );

    const currentTime = new Date().getTime();
    const timeCondition = scheduled.timeCondition || 0;
    const isTimeConditionMet = currentTime > timeCondition;

    logger.info(
      `${scheduled._id} Time condition=${new Date(
        timeCondition,
      ).toISOString()} Current=${new Date(currentTime).toISOString()}`,
    );

    return isStateConditionMet && isTimeConditionMet;
  }
}
