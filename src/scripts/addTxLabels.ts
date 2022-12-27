import { ChainId } from '../constants';
import { connect } from '../db';
import { AssetType } from '../models/Models';
import { addTxLabel } from '../services/txLabel';

main();

async function main() {
  await connect();
  await addTxLabel({
    assetType: AssetType.Ethereum,
    chainId: ChainId.Ethereum,
    type: 'address',
    hash: '',
    label: '',
  });
}
