import { CronJob } from 'cron';
import { ethers } from 'ethers';
import Scheduled from '../models/ScheduledSchema';
import { BigNumber } from 'ethers/utils';
import { IScheduled, Status } from '../models/Models';
import { stringify } from 'querystring';

const abi = ['function balanceOf(address) view returns (uint256)'];

export class Watcher {
  public static async process() {
    console.log(`Loading and starting watchers...`);

    const scheduled: IScheduled[] = await Scheduled.where(
      'status',
      Status.Pending
    ).exec();

    const groups = this.groupBySender(scheduled);
    groups.forEach((transactions) => this.processTransactions(transactions));
  }

  public static init() {
    this.process();
    new CronJob('* * * * *', () => Watcher.process(), null, true);
  }

  public static async cancel(id: string) {
    console.log(`Watcher:::cancel:::Cancelling ${id}`);

    await Scheduled.updateOne({ _id: id }, { status: Status.Cancelled }).exec();

    console.log(`Watcher:::cancel:::Cancelled ${id}`);

    return Status.Cancelled;
  }

  private static groupBySender(scheduled: IScheduled[]) {
    const mkKey = (sender: string,chainId: number) => sender+chainId.toString();
    const groups: Map<string, IScheduled[]> = new Map<string, IScheduled[]>();

    scheduled.forEach(s => {
      const key = mkKey(s.sender, s.chainId);

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(s);
    });

    return groups;
  }

  private static async processTransactions(scheduled: IScheduled[]) {
    const sorted = scheduled.sort((a,b) => a.nonce - b.nonce);
    
    for(const transaction of sorted) {
      let res = false;
      try {
        res = await this.processTransaction(transaction);
      } catch(e) {
        console.log(`Processing ${transaction._id} failed with ${e}`);
      }
      if (!res) break;
    }
  }

  private static async processTransaction(scheduled: IScheduled): Promise<boolean> {
    console.log(`Watcher:::watchBalance:::id ${scheduled._id}`);

    const transaction = ethers.utils.parseTransaction(
      scheduled.signedTransaction
    );

    console.log(
      `Watcher:::watchBalance:::Watching ${
        scheduled.conditionAsset
      } for balance ${scheduled.conditionAmount}`
    );

    const network = ethers.utils.getNetwork(transaction.chainId);
    const provider = ethers.getDefaultProvider(network);
    let balance;

    try {
      const token = new ethers.Contract(transaction.to, abi, provider);
      balance = (await token.balanceOf(transaction.from)) as BigNumber;
    } catch (e) {
      balance = await provider.getBalance(transaction.from!);
    }

    const condition = new BigNumber(scheduled.conditionAmount);
    const shouldExecute = balance.gte(condition);

    console.log(
      `Watcher:::watchBalance:::Current balance is ${balance.toString()} and condition is ${condition.toString()} res ${shouldExecute}`
    );

    if (!shouldExecute) {
      return false;
    }

    console.log('Watcher:::watchBalance:::Executing transaction...');

    let transactionHash = '';
    let status = Status.Completed;
    let error = '';

    try {
      const response = await provider.sendTransaction(
        scheduled.signedTransaction
      );
      const receipt = await response.wait();
      transactionHash = receipt.transactionHash;
      console.log(
        `Watcher:::watchBalance:::Transaction sent ${transactionHash}`
      );
    } catch (e) {
      console.log(
        `Watcher:::watchBalance:::Transaction sent, but failed with ${e}`
      );
      transactionHash = e.transactionHash;
      status = Status.Error;
      error = e.toString();
    }

    console.log(`Watcher:::watchBalance:::Completed ${scheduled._id}`);
    scheduled
      .update({ transactionHash, status, error })
      .exec();

    return true;
  }
}
