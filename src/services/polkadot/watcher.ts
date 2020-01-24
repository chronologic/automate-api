import { PolkadotChainId } from '../../models/Models';
import { ScheduleService } from '../schedule';
import getApi from './api';
import { Processor } from './processor';
import { TransactionExecutor } from './transaction';

export class Watcher {
  public static async init() {
    const transactionExecutor = new TransactionExecutor();

    const processor = new Processor(new ScheduleService(), transactionExecutor);

    setInterval(process, 60 * 1000);
    process();

    async function process() {
      const blockNumber = await getBlockNumber();

      processor.process(blockNumber);
    }

    async function getBlockNumber(): Promise<number> {
      const api = await getApi(PolkadotChainId.Kusama);
      const block: any = await api.rpc.chain.getHeader();

      return block.number.toNumber();
    }
  }
}
