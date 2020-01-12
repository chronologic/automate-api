import {
  IPolkadotTx,
  IScheduled,
  ITransactionMetadata,
  PolkadotChainId,
} from '../../models/Models';
import getApi from './api';
import logger from './logger';

async function getNextNonce(address: string): Promise<number> {
  const api = await getApi();
  const nonce = await api.query.system.accountNonce(address);

  return nonce.toNumber();
}

// TODO: IExtrinsic
async function txToExtrinsic(tx: string): Promise<any> {
  const api = await getApi();
  const extrinsic = api.createType('Extrinsic', tx);

  return extrinsic;
}

async function parseTx(tx: string): Promise<IPolkadotTx> {
  const extrinsic = await txToExtrinsic(tx);
  const methodName = extrinsic.meta.name.toString();
  const parsed: IPolkadotTx = {
    signer: extrinsic.signer.toString(),
    nonce: extrinsic.nonce.toNumber(),
    chainId: PolkadotChainId.Kusama,
    hash: extrinsic.hash.toString(),
  };

  if (methodName === 'transfer') {
    const method = JSON.parse(extrinsic.method.toString());
    parsed.dest = method.args.dest;
    parsed.value = method.args.value;
  }

  return parsed;
}

// TODO: finish implementing this
async function fetchTransactionMetadata(
  transaction: IScheduled,
): Promise<ITransactionMetadata> {
  let assetAmount = 0;
  const assetValue = 0;
  try {
    const { value: txAmount } = await parseTx(transaction.signedTransaction);
    assetAmount = txAmount;
  } catch (e) {
    logger.error(e);
  }

  return {
    assetName: 'DOT',
    assetAmount,
    assetValue,
    executedAt: null,
  };
}

export { getNextNonce, parseTx, txToExtrinsic, fetchTransactionMetadata };
