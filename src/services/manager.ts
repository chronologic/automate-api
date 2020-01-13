import { Watcher as EthereumWatcher } from './ethereum/watcher';
import { Watcher as PolkadotWatcher } from './polkadot/watcher';

import logger from './logger';

export class Manager {
  public static async init() {
    const ethereumSupport = process.env.ETHEREUM_SUPPORT === 'true';
    if (ethereumSupport) {
      EthereumWatcher.init();
    } else {
      logger.info('Ethereum support is disabled');
    }
    const polkadotSupport = process.env.POLKADOT_SUPPORT === 'true';
    if (polkadotSupport) {
      PolkadotWatcher.init();
    } else {
      logger.info('Polkadot support is disabled');
    }
  }
}
