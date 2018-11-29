import { CronJob } from 'cron';
import { ethers } from 'ethers';
import Scheduled, { IScheduled, Status } from '../models/ScheduledSchema';
import { BigNumber } from 'ethers/utils';

const abi = ['function balanceOf(address) view returns (uint256)'];

export class Watcher {
  public static jobs: Map<string, CronJob> = new Map<string, CronJob>();

  public static init() {
    console.log(`Loading and starting watchers...`);
    Scheduled.where('completed', false).exec((err, scheduled: IScheduled[]) => {
      scheduled.map(Watcher.watch);
    });
  }

  public static watch(scheduled: IScheduled) {
    console.log(`Watcher:::watch:::Starting watcher ${scheduled._id}`);

    Watcher.jobs.set(
      scheduled._id,
      new CronJob(
        '* * * * *',
        () => Watcher.watchBalance(scheduled),
        null,
        true
      )
    );
  }

  public static async cancel(id: string) {
    console.log(`Watcher:::cancel:::Cancelling ${id}`);

    return new Promise<Status>((resolve, reject) => {
      this.stop(id);
      Scheduled.updateOne(
        { _id: id },
        { status: Status.Cancelled },
        (err, raw) => {
          console.log(`Watcher:::cancel:::Cancelled ${id}`);
          resolve(Status.Cancelled);
        }
      );
    });
  }

  public static async watchBalance(scheduled: IScheduled) {
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

    const token = new ethers.Contract(transaction.to, abi, provider);
    const balance = (await token.balanceOf(transaction.from)) as BigNumber;
    const condition = new BigNumber(scheduled.conditionAmount);

    const shouldExecute = balance.gte(condition);

    console.log(
      `Watcher:::watchBalance:::Current balance is ${balance.toString()} and condition is ${condition.toString()} res ${shouldExecute}`
    );

    if (!shouldExecute) return;

    console.log('Watcher:::watchBalance:::Executing transaction...');

    let transactionHash = '';

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
    }

    console.log(`Watcher:::watchBalance:::Stopping watcher ${scheduled._id}`);
    scheduled.update({ completed: true, transactionHash }, (err, raw) => {
      this.stop(scheduled._id);
    });
  }

  private static stop(id: string) {
    Watcher.jobs.get(id).stop();
    Watcher.jobs.delete(id);
  }
}
