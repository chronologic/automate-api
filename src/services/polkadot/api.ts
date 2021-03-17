import { ApiPromise, WsProvider } from '@polkadot/api';
import BigNumber from 'bignumber.js';

import {
  IExtendedPolkadotAPI,
  IPolkadotTx,
  IScheduled,
  ITransactionMetadata,
  PolkadotChainId,
} from '../../models/Models';
import chains from './chains';
import logger from './logger';

const apis: {
  [key in PolkadotChainId]?: IExtendedPolkadotAPI;
} = {};

export default async function getApi(
  chainId: PolkadotChainId,
): Promise<IExtendedPolkadotAPI> {
  if (apis[chainId]) {
    const api = apis[chainId];
    try {
      await api.query.timestamp.now();
      return apis[chainId];
    } catch (e) {
      try {
        api.disconnect();
        // tslint:disable-next-line: no-empty
      } catch (e) {}
      logger.error(e);
      logger.debug('connection dropped, reconnecting...');
    }
  }

  const wsProvider = new WsProvider(chains[chainId].uri);
  const apiPromise = ApiPromise.create({
    provider: wsProvider,
    types: chains[chainId].types,
  });

  return apiPromise.then((api) => {
    const extendedApi = extendApi(api, chainId);
    apis[chainId] = extendedApi;
    return extendedApi;
  });
}

function extendApi(
  api: ApiPromise,
  chainId: PolkadotChainId,
): IExtendedPolkadotAPI {
  const chain = chains[chainId];

  // https://polkadot.js.org/api/start/FAQ.html#my-chain-does-not-support-system-account-queries
  async function getNextNonce(address: string): Promise<number> {
    const { accountNonce } = await api.derive.balances.account(address);

    return accountNonce.toBn().toNumber();
  }

  async function getBalance(address: string): Promise<BigNumber> {
    const { freeBalance } = await api.derive.balances.account(address);

    return new BigNumber(freeBalance.toBn().toString());
  }

  // TODO: IExtrinsic
  async function txToExtrinsic(tx: string): Promise<any> {
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
      chainId,
      chainName: PolkadotChainId[chainId],
      assetName: chain.tokenSymbol,
      decimals: chain.decimals,
      hash: extrinsic.hash.toString(),
    };

    if (methodName === 'transfer') {
      const method = JSON.parse(extrinsic.method.toString());
      parsed.dest = method.args.dest;
      parsed.value = new BigNumber(method.args.value)
        .div(new BigNumber(10).pow(chain.decimals))
        .toFormat(chain.decimals);
    }

    return parsed;
  }

  async function fetchTransactionMetadata(
    transaction: IScheduled,
  ): Promise<ITransactionMetadata> {
    let assetAmount = '0';
    const assetValue = 0;
    try {
      const { value: txAmount } = await parseTx(transaction.signedTransaction);
      assetAmount = txAmount || '0';
    } catch (e) {
      logger.error(e);
    }

    return {
      assetName: chain.tokenSymbol,
      assetAmount: +assetAmount,
      assetValue,
      assetContract: '',
      executedAt: null,
    };
  }

  (api as IExtendedPolkadotAPI).getNextNonce = getNextNonce;
  (api as IExtendedPolkadotAPI).getBalance = getBalance;
  (api as IExtendedPolkadotAPI).txToExtrinsic = txToExtrinsic;
  (api as IExtendedPolkadotAPI).parseTx = parseTx;
  (api as IExtendedPolkadotAPI).fetchTransactionMetadata = fetchTransactionMetadata;
  (api as IExtendedPolkadotAPI).chainName = chain.name;

  return api as IExtendedPolkadotAPI;
}
