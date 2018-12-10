import { ethers } from 'ethers';
import { IScheduled, Status, IExecuteStatus } from '../models/Models';
import { BigNumber } from 'ethers/utils';
import logger from './logger';

const abi = ['function balanceOf(address) view returns (uint256)'];

export class Transaction {
  public static async execute(scheduled: IScheduled): Promise<IExecuteStatus> {
    logger.info(`${scheduled._id} Executing...`);

    const hasCorrectNonce = this.hasCorrectNonce(scheduled);
    if (!hasCorrectNonce) {
      logger.info(`${scheduled._id} Incorrect nonce`);
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

    if (!this.isConditionMet(scheduled, transaction, provider)) {
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
      logger.error(`${scheduled._id} Error ${e}`);
      return {
        status: Status.Error,
        transactionHash: e.transactionHash,
        error: e.toString()
      };
    }
  }

  public static async getSenderNextNonce({ chainId, from }): Promise<number> {
    const network = ethers.utils.getNetwork(chainId);

    return ethers.getDefaultProvider(network).getTransactionCount(from);
  }

  private static async isConditionMet(
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

  private static async hasCorrectNonce(
    transaction: IScheduled
  ): Promise<boolean> {
    return (
      (await Transaction.getSenderNextNonce(transaction)) === transaction.nonce
    );
  }
}
