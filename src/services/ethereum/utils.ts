import BigNumber from 'bignumber.js';
import * as cheerio from 'cheerio';
import * as InputDataDecoder from 'ethereum-input-data-decoder';
import { ethers } from 'ethers';
import * as moment from 'moment';
import fetch from 'node-fetch';

import {
  IAssetMetadata,
  IScheduled,
  ITransactionMetadata,
  Status,
} from '../../models/Models';
import logger from './logger';
import ERC20 from '../../abi/erc20';

interface ICoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
}

const fallbackAssetName = '_';
let coinGeckoCoins: ICoinGeckoCoin[] = [];

function getSenderNextNonce({ chainId, from }): Promise<number> {
  const network = ethers.utils.getNetwork(chainId);

  return ethers.getDefaultProvider(network).getTransactionCount(from);
}

export async function fetchNetworkGasPrice(
  chainId: number,
): Promise<ethers.utils.BigNumber> {
  const provider = ethers.getDefaultProvider(ethers.utils.getNetwork(chainId));

  return provider.getGasPrice();
}

async function fetchTransactionMetadata(
  transaction: IScheduled,
): Promise<ITransactionMetadata> {
  const provider = ethers.getDefaultProvider(
    ethers.utils.getNetwork(transaction.chainId),
  );
  const parsedTx = ethers.utils.parseTransaction(transaction.signedTransaction);
  const method =
    parsedTx.value.toString() === '0' ? fetchTokenMetadata : fetchEthMetadata;

  const {
    assetName,
    assetAmount,
    assetAmountWei,
    assetDecimals,
    assetValue,
    assetContract,
    executedAt,
  } = await method.call(null, transaction, parsedTx, provider);

  return {
    assetName,
    assetAmount,
    assetAmountWei,
    assetDecimals,
    assetValue,
    assetContract,
    executedAt,
  };
}

async function fetchTokenMetadata(
  transaction: IScheduled,
  parsedTx: ethers.utils.Transaction,
  provider: ethers.providers.BaseProvider,
): Promise<IScheduled> {
  if (!transaction.assetName || transaction.assetName === '_') {
    logger.debug(`fetchTokenMetadata fetching assetName...`);
    transaction.assetName = await fetchTokenName(
      parsedTx.to,
      transaction.chainId,
    );
    logger.debug(
      `fetchTokenMetadata fetched assetName: ${transaction.assetName}`,
    );
  }

  if (transaction.assetAmount == null) {
    logger.debug(`fetchTokenMetadata fetching assetAmount...`);
    const amountData = await fetchTokenAmount(
      parsedTx.to,
      parsedTx.data,
      provider,
    );
    transaction.assetAmount = amountData.amount;
    transaction.assetAmountWei = amountData.amountWei;
    transaction.assetDecimals = amountData.decimals;
    logger.debug(
      `fetchTokenMetadata fetched assetAmount: ${transaction.assetAmount}`,
    );
  }

  if (!transaction.executedAt && transaction.transactionHash) {
    logger.debug(`fetchTokenMetadata fetching executedAt...`);
    transaction.executedAt = await fetchExecutedAt(
      transaction.transactionHash,
      provider,
    );
    logger.debug(
      `fetchTokenMetadata fetched executedAt: ${transaction.executedAt}`,
    );
  }

  if (
    transaction.assetValue == null ||
    transaction.status === Status.Completed
  ) {
    logger.debug(`fetchTokenMetadata fetching assetValue...`);
    const price = await fetchAssetPrice(
      transaction.assetName,
      transaction.executedAt,
    );

    transaction.assetValue = transaction.assetAmount * price;
    logger.debug(
      `fetchTokenMetadata fetched assetValue: ${transaction.assetValue}`,
    );
  }

  if (
    (transaction.assetName === fallbackAssetName ||
      transaction.assetValue === 0) &&
    transaction.transactionHash
  ) {
    logger.debug('fetchTokenMetadata scraping data as fallback...');
    const { assetName, assetAmount, assetValue } = await scrapeTokenMetadata(
      transaction.transactionHash,
    );

    transaction.assetName = assetName || transaction.assetName;
    transaction.assetAmount = assetAmount || transaction.assetAmount;
    transaction.assetValue = assetValue || transaction.assetValue;
  }

  transaction.assetContract = parsedTx.to;

  return transaction;
}

async function scrapeTokenMetadata(txHash) {
  try {
    const res = await fetch(
      `https://etherscan.io/tx/${txHash}`,
    ).then((response) => response.text());
    const $ = cheerio.load(res);
    const tokenDetails = $('.row .list-unstyled');
    const values = [0, 0];
    tokenDetails.find('.media-body').each((_, mb) => {
      const rowValues = $(mb)
        .find('> span.mr-1')
        .last()
        .text()
        .trim()
        .split(' ')
        .map((val) => Number(val.trim().replace(/[\(\)\$,]/g, '')));
      values[0] = values[0] + rowValues[0];
      values[1] = values[1] + rowValues[1];
    });
    const [assetAmount, assetValue] = values;
    const assetName = tokenDetails
      .find('.media-body > a')
      .first()
      .text()
      .trim()
      .split(' ')
      .reverse()[0]
      .replace(/[\(\)]/g, '')
      .toLowerCase();

    return {
      assetAmount,
      assetValue,
      assetName,
    };
  } catch (e) {
    logger.error(e);
    return {};
  }
}

async function fetchEthMetadata(
  transaction: IScheduled,
  parsedTx: ethers.utils.Transaction,
  provider: ethers.providers.BaseProvider,
): Promise<IScheduled> {
  if (!transaction.assetName) {
    transaction.assetName = 'eth';
  }

  if (transaction.assetAmount == null) {
    logger.debug(`fetchEthMetadata calculating assetAmount...`);
    transaction.assetAmount = Number(ethers.utils.formatEther(parsedTx.value));
    logger.debug(
      `fetchEthMetadata calculated assetAmount: ${transaction.assetAmount}`,
    );
  }
  transaction.assetAmountWei = parsedTx.value.toString();
  transaction.assetDecimals = 18;

  if (!transaction.executedAt && transaction.transactionHash) {
    logger.debug(`fetchEthMetadata fetching executedAt...`);
    transaction.executedAt = await fetchExecutedAt(
      transaction.transactionHash,
      provider,
    );
    logger.debug(
      `fetchEthMetadata fetched executedAt: ${transaction.executedAt}`,
    );
  }

  if (
    transaction.assetValue == null ||
    transaction.status === Status.Completed
  ) {
    logger.debug(`fetchEthMetadata fetching assetValue...`);
    const price = await fetchAssetPrice('eth', transaction.executedAt);

    transaction.assetValue = transaction.assetAmount * price;
    logger.debug(
      `fetchEthMetadata fetched assetValue: ${transaction.assetValue}`,
    );
  }

  return transaction;
}

async function fetchExecutedAt(
  txHash: string,
  provider: ethers.providers.BaseProvider,
): Promise<string> {
  try {
    const tx = await provider.getTransaction(txHash);
    const block = await provider.getBlock(tx.blockHash);
    return new Date(block.timestamp * 1000).toISOString();
  } catch (e) {
    logger.error(e);
    return moment('2000-01-01').toISOString();
  }
}

async function fetchAssetPrice(
  symbol: string,
  timestamp: string,
): Promise<number> {
  try {
    logger.debug(`fetchAssetPrice fetching assetId...`);
    const assetId = await fetchCoinGeckoAssetId(symbol);
    logger.debug(`fetchAssetPrice fetched assetId: ${assetId}`);
    const dateParam = moment(timestamp).format('DD-MM-YYYY');
    logger.debug(`fetchAssetPrice dateParam from ${timestamp}: ${dateParam}`);
    let res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${assetId}/history?date=${dateParam}`,
    ).then((response) => response.json());

    try {
      return res.market_data.current_price.usd;
    } catch (e) {
      logger.debug(
        `fetchAssetPrice historical data not available, trying current data...`,
      );
      res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`,
      ).then((response) => response.json());
      return res[assetId].usd;
    }
  } catch (e) {
    logger.error(e);
    return 0;
  }
}

async function fetchCoinGeckoAssetId(symbol): Promise<string> {
  const fallbackAssetId = '_';
  let asset = coinGeckoCoins.find((coin) => coin.symbol === symbol);

  if (asset) {
    return asset.id;
  }

  try {
    coinGeckoCoins = await fetch(
      'https://api.coingecko.com/api/v3/coins/list',
    ).then((response) => response.json());
    asset = coinGeckoCoins.find((coin) => coin.symbol === symbol);

    return asset.id || fallbackAssetId;
  } catch (e) {
    logger.error(e);
    return fallbackAssetId;
  }
}

async function fetchTokenAmount(
  contractAddress: string,
  txData: string,
  provider: ethers.providers.BaseProvider,
): Promise<{
  amountWei: string;
  amount: number;
  decimals: number;
}> {
  try {
    const decoder = new InputDataDecoder(ERC20);
    const decoded = decoder.decodeData(txData);
    const token = new ethers.Contract(contractAddress, ERC20, provider);
    const decimals = await token.functions.decimals();
    if (decoded.method === 'transfer') {
      const amount = new BigNumber(decoded.inputs[1].toString(10));

      return {
        amount: amount.div(new BigNumber(10).pow(decimals)).toNumber(),
        amountWei: amount.toString(10),
        decimals,
      };
    } else if (decoded.method === 'transferFrom') {
      const amount = new BigNumber(decoded.inputs[2].toString(10));

      return {
        amount: amount.div(new BigNumber(10).pow(decimals)).toNumber(),
        amountWei: amount.toString(10),
        decimals,
      };
    } else {
      logger.debug(
        `fetchTokenAmount unsupported decoded method: ${decoded.method}`,
      );
      return {
        amountWei: '0',
        amount: 0,
        decimals: 18,
      };
    }
  } catch (e) {
    logger.error(e);
    return {
      amountWei: '0',
      amount: 0,
      decimals: 18,
    };
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

async function fetchTokenName(
  contractAddress: string,
  chainId = 1,
): Promise<string> {
  const fallbackName = '_';

  try {
    const provider = ethers.getDefaultProvider(
      ethers.utils.getNetwork(chainId),
    );

    const contract = new ethers.Contract(contractAddress, ERC20, provider);

    const name = await contract.functions.symbol();

    return name;
  } catch (e) {
    logger.error(e);
  }

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/ethereum/contract/${contractAddress}`,
    ).then((response) => response.json());

    return res.symbol || fallbackName;
  } catch (e) {
    logger.error(e);
    return fallbackName;
  }
}

async function fetchAssetMetadata(
  transaction: IScheduled,
): Promise<IAssetMetadata> {
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

    const provider = ethers.getDefaultProvider(
      ethers.utils.getNetwork(transaction.chainId),
    );

    const contract = new ethers.Contract(
      transaction.conditionAsset,
      ERC20,
      provider,
    );

    const name = await contract.functions.symbol();
    const decimals = await contract.functions.decimals();

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

export { getSenderNextNonce, fetchTransactionMetadata, fetchAssetMetadata };
