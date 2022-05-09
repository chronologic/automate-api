import cheerio from 'cheerio';
import InputDataDecoder from 'ethereum-input-data-decoder';
import { ethers } from 'ethers';
import moment from 'moment';
import fetch from 'node-fetch';
import LRU from 'lru-cache';

import { IAssetMetadata, IGasStats, IScheduled, ITransactionMetadata, Status } from '../../models/Models';
import { ARBITRUM_URI, ARBITRUM_RINKEBY_URI, ETHERUM_URI, ROPSTEN_URI } from '../../env';
import { ChainId } from '../../constants';
import logger from './logger';
import ERC20 from '../../abi/erc20';
import { convertWeiToUsd, fetchEthPrice } from '../priceFeed';
import { weiToGwei } from '../../utils';

const lru = new LRU({ max: 10000 });

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

const fallbackAssetName = '_';
let coinGeckoCoins: ICoinGeckoCoin[] = [];

function getSenderNextNonce({ chainId, from }): Promise<number> {
  const provider = getProvider(chainId);
  return provider.getTransactionCount(from);
}

export async function getBlockNumber(chainId: number): Promise<number> {
  const provider = getProvider(chainId);
  return provider.getBlockNumber();
}

export function getProvider(chainId: number): ethers.providers.BaseProvider {
  let provider: ethers.providers.BaseProvider;
  switch (chainId) {
    case ChainId.Arbitrum:
      provider = new ethers.providers.JsonRpcProvider(ARBITRUM_URI);
      break;
    case ChainId.Arbitrum_Rinkeby:
      provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RINKEBY_URI);
      break;
    case ChainId.Ropsten:
      provider = new ethers.providers.JsonRpcProvider(ROPSTEN_URI);
      break;
    default:
      provider = new ethers.providers.JsonRpcProvider(ETHERUM_URI);
      break;
  }
  return provider;
}

export async function fetchNetworkGasPrice(chainId: number): Promise<ethers.BigNumber> {
  const provider = getProvider(chainId);

  return provider.getGasPrice();
}

async function fetchTransactionMetadata(transaction: IScheduled): Promise<ITransactionMetadata> {
  const provider = getProvider(transaction.chainId);
  const parsedTx = ethers.utils.parseTransaction(transaction.signedTransaction);
  const method = parsedTx.data !== '0x' ? fetchTokenMetadata : fetchEthMetadata;

  const {
    assetName,
    assetAmount,
    assetAmountWei,
    assetDecimals,
    assetValue,
    assetContract,
    executedAt,
  } = await method.call(null, transaction, parsedTx, provider);

  const priceStats = await fetchPriceStats(parsedTx);

  return {
    assetName,
    assetAmount,
    assetAmountWei,
    assetDecimals,
    assetValue,
    assetContract,
    executedAt,
    ...priceStats,
  };
}

export async function fetchPriceStats(tx: ethers.Transaction): Promise<IGasStats> {
  let ethPrice = 0;
  let gasPaid = 0;
  let gasPrice = 0;
  let gasSaved = 0;

  try {
    const { gasPrice: _gasPriceWei, gasLimit, chainId, maxFeePerGas, maxPriorityFeePerGas } = tx;
    const gasPriceWei = _gasPriceWei || maxFeePerGas.add(maxPriorityFeePerGas);

    const provider = getProvider(chainId);

    ethPrice = await fetchEthPrice();

    let gasUsed = gasLimit;
    try {
      const txReceipt = await provider.getTransactionReceipt(tx.hash);
      gasUsed = txReceipt.gasUsed || gasLimit;
    } catch (e) {}

    // TODO: cache gas price
    const networkGasPriceWei = await provider.getGasPrice();
    gasPrice = weiToGwei(networkGasPriceWei);

    const gasPaidWei = ethers.BigNumber.from(gasPriceWei).mul(ethers.BigNumber.from(gasUsed));
    const networkGasPaidWei = ethers.BigNumber.from(networkGasPriceWei).mul(ethers.BigNumber.from(gasUsed));

    gasPaid = await convertWeiToUsd(gasPaidWei);
    const networkGasPaid = await convertWeiToUsd(networkGasPaidWei);

    gasSaved = gasPaid < networkGasPaid ? networkGasPaid - gasPaid : 0;

    return {
      ethPrice,
      gasPrice,
      gasPaid,
      gasSaved,
    };
  } catch (e) {
    logger.error(e);

    return {
      ethPrice,
      gasPaid,
      gasPrice,
      gasSaved,
    };
  }
}

async function fetchTokenMetadata(
  transaction: IScheduled,
  parsedTx: ethers.Transaction,
  provider: ethers.providers.BaseProvider,
): Promise<IScheduled> {
  transaction.assetContract = parsedTx.to;

  if (!transaction.assetName || transaction.assetName === '_') {
    logger.debug(`fetchTokenMetadata fetching assetName...`);
    transaction.assetName = await fetchTokenName(parsedTx.to, transaction.chainId);
    logger.debug(`fetchTokenMetadata fetched assetName: ${transaction.assetName}`);
  }

  if (transaction.assetAmount == null) {
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

  if (!transaction.executedAt && transaction.transactionHash) {
    logger.debug(`fetchTokenMetadata fetching executedAt...`);
    transaction.executedAt = await fetchExecutedAt(transaction.transactionHash, provider);
    logger.debug(`fetchTokenMetadata fetched executedAt: ${transaction.executedAt}`);
  }

  if (transaction.assetValue == null || transaction.status === Status.Completed) {
    logger.debug(`fetchTokenMetadata fetching assetValue...`);
    const price = await fetchAssetPrice(transaction.assetContract, transaction.assetName, transaction.executedAt);

    transaction.assetValue = transaction.assetAmount * price;
    logger.debug(`fetchTokenMetadata fetched assetValue: ${transaction.assetValue}`);
  }

  if ((transaction.assetName === fallbackAssetName || transaction.assetValue === 0) && transaction.transactionHash) {
    logger.debug('fetchTokenMetadata scraping data as fallback...');
    const { assetName, assetAmount, assetValue } = await scrapeTokenMetadata(transaction.transactionHash);

    transaction.assetName = assetName || transaction.assetName;
    transaction.assetAmount = assetAmount || transaction.assetAmount;
    transaction.assetValue = assetValue || transaction.assetValue;
  }

  return transaction;
}

async function scrapeTokenMetadata(txHash: string): Promise<ITokenMetadata> {
  const cacheKey = `tokenMeta:${txHash}`;

  if (lru.has(cacheKey)) {
    return lru.get(cacheKey) as ITokenMetadata;
  }

  try {
    const res = await fetch(`https://etherscan.io/tx/${txHash}`).then((response) => response.text());
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
    return {} as ITokenMetadata;
  }
}

async function fetchEthMetadata(
  transaction: IScheduled,
  parsedTx: ethers.Transaction,
  provider: ethers.providers.BaseProvider,
): Promise<IScheduled> {
  if (!transaction.assetName || transaction.assetName === fallbackAssetName) {
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
    const price = await fetchAssetPrice('', 'eth', transaction.executedAt);

    transaction.assetValue = transaction.assetAmount * price;
    logger.debug(`fetchEthMetadata fetched assetValue: ${transaction.assetValue}`);
  }

  return transaction;
}

async function fetchExecutedAt(txHash: string, provider: ethers.providers.BaseProvider): Promise<string> {
  try {
    const tx = await provider.getTransaction(txHash);
    const block = await provider.getBlock(tx.blockHash);
    return new Date(block.timestamp * 1000).toISOString();
  } catch (e) {
    logger.error(e);
    return moment('2000-01-01').toISOString();
  }
}

const wethContract = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
async function fetchAssetPrice(contract: string, symbol: string, timestamp: string): Promise<number> {
  let _contract = contract;

  if (symbol === 'eth') {
    _contract = wethContract;
  }

  try {
    logger.debug(`fetchAssetPrice fetching assetId...`);
    const assetId = await fetchCoinGeckoAssetId(contract);
    logger.debug(`fetchAssetPrice fetched assetId: ${assetId}`);

    let price = 0;

    if (timestamp) {
      const dateParam = moment(timestamp).format('DD-MM-YYYY');
      logger.debug(
        `fetchAssetPrice dateParam from ${timestamp}: ${dateParam}; https://api.coingecko.com/api/v3/coins/${assetId}/history?date=${dateParam}`,
      );
      let res = await fetch(
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

async function fetchCoinGeckoAssetId(contract: string): Promise<string> {
  const fallbackAssetId = '_';
  const { id } = await fetchCoingeckoAssetData(contract);
  const res = id || fallbackAssetId;

  return res;
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
    amountWei: '0',
    amount: 0,
    decimals: 18,
  };

  try {
    const decoder = new InputDataDecoder(ERC20);
    const decoded = decoder.decodeData(txData);
    const decimals = await fetchTokenDecimals(contractAddress, chainId);

    if (decoded.method === 'transfer') {
      const amount = ethers.BigNumber.from(decoded.inputs[1].toString(10));

      return {
        amount: amount.div(ethers.BigNumber.from(10).pow(decimals)).toNumber(),
        amountWei: amount.toString(),
        decimals,
      };
    } else if (decoded.method === 'transferFrom') {
      const amount = ethers.BigNumber.from(decoded.inputs[2].toString(10));

      return {
        amount: amount.div(ethers.BigNumber.from(10).pow(decimals)).toNumber(),
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

async function fetchTokenName(contractAddress: string, chainId = 1): Promise<string> {
  const fallbackName = '_';
  const cacheKey = `tokenName:${contractAddress}:${chainId}`;

  if (lru.has(cacheKey)) {
    return lru.get(cacheKey) as string;
  }

  try {
    const provider = getProvider(chainId);

    const contract = new ethers.Contract(contractAddress, ERC20, provider);

    const [name] = await contract.functions.symbol();

    lru.set(cacheKey, name);

    return name;
  } catch (e) {
    logger.error(e);
  }

  try {
    const res = await fetchCoingeckoAssetData(contractAddress);

    const name = res.symbol || fallbackName;

    lru.set(cacheKey, name);

    return name;
  } catch (e) {
    logger.error(e);
    return fallbackName;
  }
}

async function fetchConditionAssetMetadata(transaction: IScheduled): Promise<IAssetMetadata> {
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
    return lru.get(cacheKey) as number;
  }

  const contract = new ethers.Contract(contractAddress, ERC20, provider);

  const [decimals] = await contract.functions.decimals();

  lru.set(cacheKey, decimals);

  return decimals;
}

async function fetchCoingeckoAssetData(contractAddress: string): Promise<any> {
  const cacheKey = `assetData:${contractAddress}`;

  if (lru.has(cacheKey)) {
    return lru.get(cacheKey) as string;
  }

  const json = await fetch(
    `https://api.coingecko.com/api/v3/coins/ethereum/contract/${contractAddress}`,
  ).then((response) => response.json());

  lru.set(cacheKey, json);

  return json;
}

export { getSenderNextNonce, fetchTransactionMetadata, fetchConditionAssetMetadata };
