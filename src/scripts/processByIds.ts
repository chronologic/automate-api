import { connect } from '../db';
import { Watcher as EthereumWatcher } from '../services/ethereum/watcher';

main();

async function main() {
  await connect();
  await EthereumWatcher.processByIds(['']);
  // await EthereumWatcher.fillMetadataByIds(['']);
}
