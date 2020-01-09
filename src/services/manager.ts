// import { Watcher as EthereumWatcher } from './ethereum/watcher';
import { Watcher as PolkadotWatcher } from './polkadot/watcher';

export class Manager {
  public static async init() {
    // EthereumWatcher.init();
    PolkadotWatcher.init();
  }
}
