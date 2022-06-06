import cheerio from 'cheerio';
import InputDataDecoder from 'ethereum-input-data-decoder';
import { ethers } from 'ethers';
import moment from 'moment';
import fetch from 'node-fetch';
import LRU from 'lru-cache';

import { IAssetMetadata, IGasStats, IScheduled, ITransactionMetadata, Status } from '../../models/Models';
import { ARBITRUM_URI, ARBITRUM_RINKEBY_URI, ETHERUM_URI, ROPSTEN_URI } from '../../env';
import { ChainId, SECOND_MILLIS } from '../../constants';
import ERC20 from '../../abi/erc20';
import { convertWeiToUsd, fetchEthPrice } from '../priceFeed';
import { getTimedCachedValue, sleep } from '../../utils';
import logger from './logger';

const lru = new LRU({ max: 10000 });
const erc20Decoder = new InputDataDecoder(ERC20);

interface ICoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
}

interface ITokenMetadata {
  assetAmount: number;
  assetValue: number;
  assetName: string;
}

const PROVIDER: {
  [key in ChainId]?: ethers.providers.BaseProvider;
} = {
  [ChainId.Arbitrum]: new ethers.providers.JsonRpcProvider(ARBITRUM_URI),
  [ChainId.Arbitrum_Rinkeby]: new ethers.providers.JsonRpcProvider(ARBITRUM_RINKEBY_URI),
  [ChainId.Ropsten]: new ethers.providers.JsonRpcProvider(ROPSTEN_URI),
  [ChainId.Ethereum]: new ethers.providers.JsonRpcProvider(ETHERUM_URI),
};

export function getProvider(chainId: number): ethers.providers.BaseProvider {
  return PROVIDER[chainId] || PROVIDER[ChainId.Ethereum];
}

export async function getSenderNextNonce({ chainId, from }): Promise<number> {
  const provider = getProvider(chainId);
  return retryRpcCallOnIntermittentError(() => provider.getTransactionCount(from));
}

export async function getBlockNumber(chainId: number): Promise<number> {
  const cacheKey = `eth.blockNumber.${chainId}`;
  return getTimedCachedValue({
    key: cacheKey,
    ttlMillis: 10 * SECOND_MILLIS,
    fetchValue: async () => {
      const provider = getProvider(chainId);
      return retryRpcCallOnIntermittentError(() => provider.getBlockNumber());
    },
  });
}

export async function fetchNetworkGasPrice(chainId: number): Promise<ethers.BigNumber> {
  const cacheKey = `eth.gasPrice.${chainId}`;
  return getTimedCachedValue({
    key: cacheKey,
    ttlMillis: 10 * SECOND_MILLIS,
    fetchValue: async () => {
      const provider = getProvider(chainId);
      return retryRpcCallOnIntermittentError(() => provider.getGasPrice());
    },
  });
}

export async function fetchTransactionMetadata(transaction: IScheduled): Promise<ITransactionMetadata> {
  const provider = getProvider(transaction.chainId);
  const parsedTx = ethers.utils.parseTransaction(transaction.signedTransaction);
  let txWithMeta = transaction;

  if (isEthTx(parsedTx.data)) {
    txWithMeta = await fetchEthMetadata({
      chainId: transaction.chainId,
      parsedTx,
      provider,
      transaction,
    });
  } else if (isTokenTx(parsedTx.data)) {
    txWithMeta = await fetchTokenMetadata({
      chainId: transaction.chainId,
      parsedTx,
      provider,
      transaction,
    });
  }

  const priceStats = await fetchPriceStats(parsedTx);

  const metadata: ITransactionMetadata = {
    assetAmount: txWithMeta.assetAmount,
    assetAmountWei: txWithMeta.assetAmountWei,
    assetContract: txWithMeta.assetContract,
    assetDecimals: txWithMeta.assetDecimals,
    assetName: txWithMeta.assetName,
    assetValue: txWithMeta.assetValue,
    executedAt: txWithMeta.executedAt,
  };

  return {
    ...metadata,
    ...priceStats,
  };
}

function isEthTx(txData: string): boolean {
  return (txData || '').toLowerCase() === '0x';
}

function isTokenTx(txData: string): boolean {
  try {
    const decoded = erc20Decoder.decodeData(txData);

    return !!decoded.method;
  } catch (e) {
    logger.debug(e);
    return false;
  }
}

export function decodeTxGasParamsFromSignedTx(
  signedTx: string,
): {
  combinedGasPrice: ethers.BigNumber;
  gasPrice: ethers.BigNumber;
  gasLimit: ethers.BigNumber;
  maxFeePerGas: ethers.BigNumber;
  maxPriorityFeePerGas: ethers.BigNumber;
} {
  const tx = ethers.utils.parseTransaction(signedTx);

  return decodeTxGasParams(tx);
}

export function decodeTxGasParams(
  tx: ethers.Transaction,
): {
  combinedGasPrice: ethers.BigNumber;
  gasPrice: ethers.BigNumber;
  gasLimit: ethers.BigNumber;
  maxFeePerGas: ethers.BigNumber;
  maxPriorityFeePerGas: ethers.BigNumber;
} {
  const { gasPrice, gasLimit, maxFeePerGas, maxPriorityFeePerGas } = tx;
  const combinedGasPrice = gasPrice || maxFeePerGas.add(maxPriorityFeePerGas);

  return { combinedGasPrice, gasPrice, gasLimit, maxFeePerGas, maxPriorityFeePerGas };
}

export async function fetchPriceStats(tx: ethers.Transaction): Promise<IGasStats> {
  let ethPrice = 0;
  let gasPaid = 0;
  let txGasPrice = '0';
  let gasSaved = 0;
  let networkGasPrice = 0;

  try {
    const { combinedGasPrice, gasLimit } = decodeTxGasParams(tx);
    txGasPrice = combinedGasPrice.toString();

    const { chainId } = tx;

    const provider = getProvider(chainId);

    ethPrice = await fetchEthPrice();

    let gasUsed = gasLimit;
    try {
      const txReceipt = await retryRpcCallOnIntermittentError(() => provider.getTransactionReceipt(tx.hash));
      gasUsed = txReceipt.gasUsed || gasLimit;
    } catch (e) {}

    const networkGasPriceWei = await fetchNetworkGasPrice(tx.chainId);
    networkGasPrice = Number(ethers.utils.formatUnits(networkGasPriceWei, 'gwei'));

    const gasPaidWei = ethers.BigNumber.from(txGasPrice).mul(ethers.BigNumber.from(gasUsed));
    const networkGasPaidWei = ethers.BigNumber.from(networkGasPriceWei).mul(ethers.BigNumber.from(gasUsed));

    gasPaid = await convertWeiToUsd(gasPaidWei);
    const networkGasPaid = await convertWeiToUsd(networkGasPaidWei);

    gasSaved = gasPaid < networkGasPaid ? networkGasPaid - gasPaid : 0;

    return {
      ethPrice,
      txGasPrice,
      networkGasPrice,
      gasPaid,
      gasSaved,
    };
  } catch (e) {
    logger.error(e);

    return {
      ethPrice,
      txGasPrice,
      gasPaid,
      networkGasPrice,
      gasSaved,
    };
  }
}

async function fetchTokenMetadata({
  transaction,
  parsedTx,
  provider,
  chainId,
}: {
  transaction: IScheduled;
  parsedTx: ethers.Transaction;
  provider: ethers.providers.BaseProvider;
  chainId: ChainId;
}): Promise<IScheduled> {
  transaction.assetContract = parsedTx.to;

  if (!transaction.assetName) {
    logger.debug(`fetchTokenMetadata fetching assetName...`);
    transaction.assetName = await fetchTokenName(parsedTx.to, transaction.chainId);
    logger.debug(`fetchTokenMetadata fetched assetName: ${transaction.assetName}`);
  }

  if (!transaction.assetAmount) {
    logger.debug(`fetchTokenMetadata fetching assetAmount...`);
    const amountData = await fetchTokenAmount({
      chainId: transaction.chainId,
      contractAddress: parsedTx.to,
      txData: parsedTx.data,
    });
    transaction.assetAmount = amountData.amount;
    transaction.assetAmountWei = amountData.amountWei;
    transaction.assetDecimals = amountData.decimals;
    logger.debug(`fetchTokenMetadata fetched assetAmount: ${transaction.assetAmount}`);
  }

  if ((!transaction.assetValue || transaction.status === Status.Completed) && transaction.assetAmount) {
    logger.debug(`fetchTokenMetadata fetching assetValue...`);
    const price = await fetchAssetPrice({
      contract: transaction.assetContract,
      symbol: transaction.assetName,
      timestamp: transaction.executedAt,
      chainId,
    });

    transaction.assetValue = transaction.assetAmount * price;
    logger.debug(`fetchTokenMetadata fetched assetValue: ${transaction.assetValue}`);
  }

  if ((!transaction.assetName || !transaction.assetValue) && transaction.transactionHash) {
    logger.debug('fetchTokenMetadata scraping data as fallback...');
    const { assetName, assetAmount, assetValue } = await scrapeTokenMetadata(
      transaction.transactionHash,
      transaction.chainId,
    );

    transaction.assetName = assetName || transaction.assetName;
    transaction.assetAmount = assetAmount || transaction.assetAmount;
    transaction.assetValue = assetValue || transaction.assetValue;
  }

  if (!transaction.executedAt && transaction.transactionHash) {
    logger.debug(`fetchTokenMetadata fetching executedAt...`);
    transaction.executedAt = await fetchExecutedAt(transaction.transactionHash, provider);
    logger.debug(`fetchTokenMetadata fetched executedAt: ${transaction.executedAt}`);
  }

  return transaction;
}

async function scrapeTokenMetadata(txHash: string, chainId: ChainId): Promise<ITokenMetadata> {
  const cacheKey = `tokenMeta:${txHash}`;

  if (lru.has(cacheKey)) {
    return lru.get(cacheKey) as ITokenMetadata;
  }

  const defaultResult = {} as ITokenMetadata;

  const explorerNameForChainId: {
    [key in ChainId]?: string;
  } = {
    [ChainId.Arbitrum]: 'arbiscan',
    [ChainId.Arbitrum_Rinkeby]: 'testnet.arbiscan',
    [ChainId.Ethereum]: 'etherscan',
    [ChainId.Ropsten]: 'ropsten.etherscan',
  };

  const explorerName = explorerNameForChainId[chainId];

  if (!explorerName) {
    return defaultResult;
  }

  const resPromise = (async () => {
    try {
      const res = await fetch(`https://${explorerName}.io/tx/${txHash}`).then((response) => response.text());
      const $ = cheerio.load(res);
      const tokenDetails = $('.row .list-unstyled');
      let assetAmount = 0;
      let assetValue = 0;
      tokenDetails.find('.media-body').each((_, mb) => {
        assetAmount = Number($(mb).find('> span.mr-1').last().text().trim().replace(/,/g, '')) || 0;
      });

      const transferDetails = tokenDetails.find('.media-body').text();

      try {
        assetValue = Number(/\(\$[0-9,.]+\)/.exec(transferDetails)[0].replace(/[\(\)\$,]/g, ''));
      } catch (e) {
        logger.error(e);
      }

      const assetName = tokenDetails
        .find('.media-body > a')
        .first()
        .text()
        .trim()
        .split(' ')
        .reverse()[0]
        .replace(/[\(\)]/g, '')
        .toLowerCase();

      const meta = {
        assetAmount: assetAmount || 0,
        assetValue: assetValue || 0,
        assetName: assetName || '',
      };

      lru.set(cacheKey, meta);

      return meta;
    } catch (e) {
      logger.error(e);
      return defaultResult;
    }
  })();

  lru.set(cacheKey, resPromise);

  return resPromise;
}

async function fetchEthMetadata({
  transaction,
  parsedTx,
  provider,
  chainId,
}: {
  transaction: IScheduled;
  parsedTx: ethers.Transaction;
  provider: ethers.providers.BaseProvider;
  chainId: ChainId;
}): Promise<IScheduled> {
  if (!transaction.assetName) {
    transaction.assetName = 'eth';
  }

  transaction.assetContract = '';

  if (transaction.assetAmount == null) {
    logger.debug(`fetchEthMetadata calculating assetAmount...`);
    transaction.assetAmount = Number(ethers.utils.formatEther(parsedTx.value));
    logger.debug(`fetchEthMetadata calculated assetAmount: ${transaction.assetAmount}`);
  }
  transaction.assetAmountWei = parsedTx.value.toString();
  transaction.assetDecimals = 18;

  if (!transaction.executedAt && transaction.transactionHash && transaction.status !== Status.Draft) {
    logger.debug(`fetchEthMetadata fetching executedAt...`);
    transaction.executedAt = await fetchExecutedAt(transaction.transactionHash, provider);
    logger.debug(`fetchEthMetadata fetched executedAt: ${transaction.executedAt}`);
  }

  if (transaction.assetValue == null || transaction.status === Status.Completed) {
    logger.debug(`fetchEthMetadata fetching assetValue...`);
    const price = await fetchAssetPrice({
      contract: '',
      symbol: 'eth',
      timestamp: transaction.executedAt,
      chainId,
    });

    transaction.assetValue = transaction.assetAmount * price;
    logger.debug(`fetchEthMetadata fetched assetValue: ${transaction.assetValue}`);
  }

  return transaction;
}

async function fetchExecutedAt(txHash: string, provider: ethers.providers.BaseProvider): Promise<string> {
  try {
    const tx = await retryRpcCallOnIntermittentError(() => provider.getTransaction(txHash));
    const block = await retryRpcCallOnIntermittentError(() => provider.getBlock(tx.blockHash));
    return new Date(block.timestamp * 1000).toISOString();
  } catch (e) {
    logger.error(e);
    return moment('2000-01-01').toISOString();
  }
}

async function fetchAssetPrice({
  contract,
  symbol,
  timestamp,
  chainId,
}: {
  contract: string;
  symbol: string;
  timestamp: string;
  chainId: ChainId;
}): Promise<number> {
  let _contract = contract;
  let _chainId = chainId;

  if (symbol === 'eth') {
    const wethContract = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    _contract = wethContract;
    _chainId = ChainId.Ethereum;
  }

  try {
    logger.debug(`fetchAssetPrice fetching assetId...`);
    const assetId = await fetchCoinGeckoAssetId(_contract, _chainId);
    logger.debug(`fetchAssetPrice fetched assetId: ${assetId}`);

    let price = 0;

    if (timestamp) {
      const dateParam = moment(timestamp).format('DD-MM-YYYY');
      logger.debug(
        `fetchAssetPrice dateParam from ${timestamp}: ${dateParam}; https://api.coingecko.com/api/v3/coins/${assetId}/history?date=${dateParam}`,
      );
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${assetId}/history?date=${dateParam}`,
      ).then((response) => response.json());

      price = res.market_data?.current_price?.usd;
    }

    if (!price) {
      logger.debug(
        `fetchAssetPrice fetching current price https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`,
      );
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`,
      ).then((response) => response.json());
      price = res[assetId].usd;
    }

    return price;
  } catch (e) {
    logger.error(e);
    return 0;
  }
}

async function fetchCoinGeckoAssetId(contract: string, chainId: ChainId): Promise<string> {
  const { id } = await fetchCoingeckoAssetData(contract, chainId);

  return id;
}

async function fetchTokenAmount({
  contractAddress,
  chainId,
  txData,
}: {
  contractAddress: string;
  txData: string;
  chainId: number;
}): Promise<{
  amountWei: string;
  amount: number;
  decimals: number;
}> {
  const defaultValue = {
    amountWei: '',
    amount: null,
    decimals: null,
  };

  try {
    const decoded = erc20Decoder.decodeData(txData);
    if (!decoded.method) {
      return defaultValue;
    }

    const decimals = await fetchTokenDecimals(contractAddress, chainId);

    if (decoded.method === 'transfer') {
      const amount = ethers.BigNumber.from(decoded.inputs[1].toString(10));

      return {
        amount: Number(ethers.utils.formatUnits(amount, decimals)),
        amountWei: amount.toString(),
        decimals,
      };
    } else if (decoded.method === 'transferFrom') {
      const amount = ethers.BigNumber.from(decoded.inputs[2].toString(10));

      return {
        amount: Number(ethers.utils.formatUnits(amount, decimals)),
        amountWei: amount.toString(),
        decimals,
      };
    } else {
      logger.debug(`fetchTokenAmount unsupported decoded method: ${decoded.method}`);
      return defaultValue;
    }
  } catch (e) {
    logger.error(e);
    return defaultValue;
  }
}

async function fetchABI(contractAddress: string): Promise<any> {
  try {
    const res = await fetch(
      `https://api.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`,
    ).then((response) => response.json());

    return JSON.parse(res.result);
  } catch (e) {
    logger.error(e);
    return [{}];
  }
}

async function fetchTokenName(contractAddress: string, chainId: ChainId): Promise<string> {
  const cacheKey = `tokenName:${contractAddress}:${chainId}`;

  if (lru.has(cacheKey)) {
    return lru.get(cacheKey) as string;
  }

  const resPromise = (async () => {
    try {
      const provider = getProvider(chainId);
      const contract = new ethers.Contract(contractAddress, ERC20, provider);
      const [name] = await retryRpcCallOnIntermittentError(() => contract.functions.symbol());

      return name;
    } catch (e) {
      console.error('Failed to fetch token name from chain');
      logger.error(e);
    }

    try {
      const res = await fetchCoingeckoAssetData(contractAddress, chainId);
      const name = res.symbol;

      return name;
    } catch (e) {
      console.error('Failed to fetch token name from coingecko');
      logger.error(e);
    }
  })();

  lru.set(cacheKey, resPromise);

  return resPromise;
}

export async function fetchConditionAssetMetadata(transaction: IScheduled): Promise<IAssetMetadata> {
  try {
    if (!transaction.conditionAsset && !transaction.conditionAmount) {
      return {
        name: '',
        decimals: null,
      };
    }

    const isEth = transaction.conditionAsset === '';

    if (isEth) {
      return {
        decimals: 18,
        name: 'eth',
      };
    }

    const name = await fetchTokenName(transaction.conditionAsset, transaction.chainId);
    const decimals = await fetchTokenDecimals(transaction.conditionAsset, transaction.chainId);

    return {
      name,
      decimals,
    };
  } catch (e) {
    logger.error(e);
    return {
      name: '',
      decimals: 18,
    };
  }
}

async function fetchTokenDecimals(contractAddress: string, chainId: number): Promise<number> {
  const provider = getProvider(chainId);
  const cacheKey = `decimals:${contractAddress}:${chainId}`;

  if (lru.has(cacheKey)) {
    return lru.get(cacheKey) as Promise<number>;
  }

  const contract = new ethers.Contract(contractAddress, ERC20, provider);

  const resPromise = (async () => {
    const [decimals] = await retryRpcCallOnIntermittentError(() => contract.functions.decimals());
    return decimals;
  })();

  lru.set(cacheKey, resPromise);

  return resPromise;
}

async function fetchCoingeckoAssetData(contractAddress: string, chainId: ChainId): Promise<any> {
  const contractAddressLowercase = (contractAddress || '').toLowerCase();
  const cacheKey = `assetData:${contractAddressLowercase}`;

  if (lru.has(cacheKey)) {
    return lru.get(cacheKey);
  }

  const platformForChainId: {
    [key in ChainId]?: string;
  } = {
    [ChainId.Arbitrum]: 'arbitrum-one',
    [ChainId.Ethereum]: 'ethereum',
  };

  const platform = platformForChainId[chainId];

  if (!platform) {
    return {};
  }

  const resPromise = fetch(
    `https://api.coingecko.com/api/v3/coins/${platform}/contract/${contractAddressLowercase}`,
  ).then((response) => response.json());

  lru.set(cacheKey, resPromise);

  return resPromise;
}

export async function retryRpcCallOnIntermittentError<T>(fn: () => Promise<T>): Promise<T> {
  return await _retryRpcCallOnIntermittentError(fn);
}

async function _retryRpcCallOnIntermittentError<T>(fn: () => Promise<T>, retryCounter = 0): Promise<T> {
  const maxRetries = 20;
  try {
    return await fn();
  } catch (e) {
    const intermittentRpcError = 'unsupported block number';
    const errorMessage = e?.message || '';
    if (errorMessage.includes(intermittentRpcError) && retryCounter < maxRetries) {
      await sleep(500);
      return await _retryRpcCallOnIntermittentError(fn, retryCounter++);
    } else {
      throw e;
    }
  }
}
