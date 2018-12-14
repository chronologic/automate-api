import { ethers } from 'ethers';
// tslint:disable-next-line:no-submodule-imports
import { BigNumber } from 'ethers/utils';

import { IExecuteStatus, IScheduled, Status } from '../models/Models';
import logger from './logger';

const abi = ['function balanceOf(address) view returns (uint256)'];

export interface ITransactionExecutor {
  execute(scheduled: IScheduled): Promise<IExecuteStatus>;
}
export class TransactionExecutor implements ITransactionExecutor {
  public static async getSenderNextNonce({ chainId, from }): Promise<number> {
    const network = ethers.utils.getNetwork(chainId);

    return ethers.getDefaultProvider(network).getTransactionCount(from);
  }

  public async execute(scheduled: IScheduled): Promise<IExecuteStatus> {
    logger.info(`${scheduled._id} Executing...`);

    const senderNonce = await TransactionExecutor.getSenderNextNonce(scheduled);

    logger.info(
      `${scheduled._id} Sender nonce ${senderNonce} transaction nonce ${
        scheduled.nonce
      }`
    );

    if (senderNonce > scheduled.nonce) {
      logger.info(`${scheduled._id} Transaction nonce already spent`);
      return { status: Status.StaleNonce };
    }

    if (senderNonce !== scheduled.nonce) {
      logger.info(`${scheduled._id} Nonce does not match`);
      return { status: Status.Pending };
    }

    const transaction = ethers.utils.parseTransaction(
      scheduled.signedTransaction
    );

    const network = ethers.utils.getNetwork(transaction.chainId);
    const provider = ethers.getDefaultProvider(network);

    const networkTransaction = await provider.getTransaction(transaction.hash!);
    if (networkTransaction && networkTransaction.hash) {
      logger.info(`${scheduled._id} Already posted ${networkTransaction.hash}`);
      return { status: Status.Pending };
    }

    if (!(await this.isConditionMet(scheduled, transaction, provider))) {
      logger.info(`${scheduled._id} Condition not met`);
      return { status: Status.Pending };
    }

    try {
      const response = await provider.sendTransaction(
        scheduled.signedTransaction
      );
      logger.info(`${scheduled._id} Sent ${response.hash}`);

      const receipt = await response.wait();
      logger.info(`${scheduled._id} Confirmed ${receipt.transactionHash}`);

      return {
        status: Status.Completed,
        transactionHash: receipt.transactionHash
      };
    } catch (e) {
      logger.error(`${scheduled._id} ${e}`);
      return {
        status: Status.Error,
        transactionHash: e.transactionHash,
        error: e.toString()
      };
    }
  }

  private async isConditionMet(
    scheduled: IScheduled,
    transaction: ethers.utils.Transaction,
    provider: ethers.providers.BaseProvider
  ) {
    logger.info(
      `${scheduled._id} Condition: asset=${scheduled.conditionAsset} amount=${
        scheduled.conditionAmount
      }`
    );

    let currentConditionAmount;

    try {
      const token = new ethers.Contract(transaction.to, abi, provider);
      currentConditionAmount = (await token.balanceOf(
        transaction.from
      )) as BigNumber;
    } catch (e) {
      currentConditionAmount = await provider.getBalance(transaction.from!);
    }

    const condition = new BigNumber(scheduled.conditionAmount);
    const shouldExecute = currentConditionAmount.gte(condition);

    logger.info(
      `${
        scheduled._id
      } Condition=${condition.toString()} Current=${currentConditionAmount.toString()}`
    );

    return shouldExecute;
  }
}
