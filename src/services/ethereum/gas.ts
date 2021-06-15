import fetch from 'node-fetch';
import { ethers } from 'ethers';

import { MINUTE_MILLIS } from '../../constants';
import { GAS_PRICE_FEED_URL } from '../../env';
import { bnToNumber, createTimedCache } from '../../utils';

type IHistoricalGasPrice = [number, number];

type GasPriceTimeRange = '1d' | '3d' | '5d' | '7d';

interface IGasSavingsResponse {
  savingsPercent: number;
}

const gasSavingsCache = createTimedCache<Promise<IGasSavingsResponse>>(5 * MINUTE_MILLIS);
const gasPricesCache = createTimedCache<Promise<IHistoricalGasPrice[]>>(30 * MINUTE_MILLIS);

async function estimateGasSavings(): Promise<IGasSavingsResponse> {
  const cacheKey = 'savings';
  const res = gasSavingsCache.get(cacheKey);

  if (res) {
    return res;
  }

  const promise = fetchEstimatedGasSavings();

  gasSavingsCache.put(cacheKey, promise);

  return promise;
}

async function fetchEstimatedGasSavings(): Promise<IGasSavingsResponse> {
  const historicalGasPrices = await getHistoricalGasPrices('7d');
  const minGasPrice = Math.min(...historicalGasPrices.map(([_t, price]) => price));

  const network = ethers.utils.getNetwork(1);
  const provider = ethers.getDefaultProvider(network);

  const currentGasPriceBn = await provider.getGasPrice();
  const currentGasPrice = bnToNumber(currentGasPriceBn, 9, 0);
  const currentGasPriceFast = currentGasPrice * 1.2;

  const savingsPercent = (1 - minGasPrice / currentGasPriceFast) * 100;

  const minSavingsPercent = 5;

  return { savingsPercent: Number(Math.max(minSavingsPercent, savingsPercent).toFixed(2)) };
}

async function getHistoricalGasPrices(range: GasPriceTimeRange): Promise<IHistoricalGasPrice[]> {
  let _range = range;
  if (_range !== '1d') {
    _range = '7d';
  }

  const res = gasPricesCache.get(_range);

  if (res) {
    return res;
  }

  const promise = fetchHistoricalGasPricesFromApi(_range);

  gasPricesCache.put(_range, promise);

  return promise;
}

async function fetchHistoricalGasPricesFromApi(range: GasPriceTimeRange): Promise<IHistoricalGasPrice[]> {
  const endpoint = `${GAS_PRICE_FEED_URL}${range === '1d' ? '24h' : '7d'}.json?_=${new Date().getTime()}`;

  const res = await fetch(endpoint);
  const json: IHistoricalGasPrice[] = await res.json();

  const mapped = json.map(([timestamp, price]) => [timestamp * 1000, price] as IHistoricalGasPrice);

  return mapped;
}

const gasService = {
  estimateGasSavings,
};

export { gasService };
