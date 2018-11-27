import { CronJob } from 'cron';
import { ethers } from 'ethers';
import Scheduled, { IScheduled } from '../models/ScheduledSchema';
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
    console.log(`Starting watcher ${scheduled._id}`);

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

  public static async watchBalance(scheduled: IScheduled) {
    const transaction = ethers.utils.parseTransaction(scheduled.signedTransaction);

    console.log(
      `Watching ${scheduled.conditionAsset} for balance ${scheduled.conditionAmount}`
    );

    const network = ethers.utils.getNetwork(transaction.chainId);
    const provider = ethers.getDefaultProvider(network);

    const token = new ethers.Contract(transaction.to, abi, provider);
    const balance = (await token.balanceOf(transaction.from)) as BigNumber;
    const condition = new BigNumber(scheduled.conditionAmount);

    const shouldExecute = balance.gte(condition);

    console.log(
      `Current balance is ${balance.toString()} and condition is ${condition.toString()} res ${shouldExecute}`
    );

    if (!shouldExecute) return;

    console.log('Executing transaction...');
    
    let transactionHash = '';
    
    try {
      const response = await provider.sendTransaction(scheduled.signedTransaction);
      const receipt = await response.wait();
      transactionHash = receipt.transactionHash;
      console.log(`Transaction sent ${transactionHash}`)
    } catch(e) {
      console.log(`Transaction sent, but failed with ${e}`)
      transactionHash = e.transactionHash;
    }

    console.log(`Stopping watcher ${scheduled._id}`);
    scheduled.update({ completed: true, transactionHash }, (err, raw) => {
      Watcher.jobs.get(scheduled._id).stop();
      Watcher.jobs.delete(scheduled._id);
    });
  }
}
