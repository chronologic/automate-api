import BigNumber from 'bignumber.js';

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
  const signer = extrinsic.signer.toString();
  const accountNonce = await getNextNonce(signer);
  const parsed: IPolkadotTx = {
    signer,
    nonce: extrinsic.nonce.toNumber(),
    accountNonce,
    chainId: PolkadotChainId.Kusama,
    chainName: PolkadotChainId[PolkadotChainId.Kusama],
    assetName: 'DOT',
    hash: extrinsic.hash.toString(),
  };

  if (methodName === 'transfer') {
    const decimals = 12;
    const method = JSON.parse(extrinsic.method.toString());
    parsed.dest = method.args.dest;
    parsed.value = new BigNumber(method.args.value)
      .div(new BigNumber(10).pow(decimals))
      .toFormat(decimals);
    parsed.decimals = decimals;
  }

  return parsed;
}

// TODO: finish implementing this
async function fetchTransactionMetadata(
  transaction: IScheduled,
): Promise<ITransactionMetadata> {
  let assetAmount = '0';
  const assetValue = 0;
  try {
    const { value: txAmount } = await parseTx(transaction.signedTransaction);
    assetAmount = txAmount;
  } catch (e) {
    logger.error(e);
  }

  return {
    assetName: 'DOT',
    assetAmount: +assetAmount,
    assetValue,
    executedAt: null,
  };
}

export { getNextNonce, parseTx, txToExtrinsic, fetchTransactionMetadata };
