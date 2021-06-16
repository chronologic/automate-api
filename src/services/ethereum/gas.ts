import fetch from 'node-fetch';
import { ethers } from 'ethers';

import { DAY_MILLIS, GWEI_DECIMALS, MINUTE_MILLIS } from '../../constants';
import { GAS_PRICE_FEED_URL } from '../../env';
import { bnToNumber, createTimedCache } from '../../utils';
import { BadRequestError } from '../../errors';

type IHistoricalGasPrice = [number, number];

type GasPriceTimeRange = '1d' | '3d' | '5d' | '7d';

interface IGasEstimateResponse {
  gwei: number;
}
interface IGasSavingsResponse {
  savingsPercent: number;
}

const gasEstimateCache = createTimedCache<Promise<IGasEstimateResponse>>(3 * MINUTE_MILLIS);
const gasSavingsCache = createTimedCache<Promise<IGasSavingsResponse>>(5 * MINUTE_MILLIS);
const gasPricesCache = createTimedCache<Promise<IHistoricalGasPrice[]>>(30 * MINUTE_MILLIS);

async function estimateGas(range: GasPriceTimeRange): Promise<IGasEstimateResponse> {
  validateGasPriceTimeRange(range);
  const res = gasEstimateCache.get(range);

  if (res) {
    return res;
  }

  const promise = calcGasEstimate(range);

  gasEstimateCache.put(range, promise);

  return promise;
}

async function calcGasEstimate(range: GasPriceTimeRange): Promise<IGasEstimateResponse> {
  const historicalGasPrices = await getHistoricalGasPrices(range);

  const days = Number(range.split('')[0]);

  // [gwei, weight]
  const prices: [number, number][] = [];
  const averages: [number, number][] = [];

  for (let i = 1; i <= days; i++) {
    const threshold = new Date().getTime() - i * DAY_MILLIS;
    const gasPricesForRange = historicalGasPrices
      .filter(([timestamp]) => timestamp > threshold)
      .map(([_t, price]) => price);

    const minGasPrice = Math.min(...gasPricesForRange);
    const avgGasPrice = gasPricesForRange.reduce((sum, price) => sum + price, 0) / gasPricesForRange.length;
    const weight = 1 / i;

    prices.push([minGasPrice, weight]);
    averages.push([avgGasPrice, weight]);
  }

  const weightedAvgPrice = weightedAvg(prices);
  const weightedAvgAverage = weightedAvg(averages);

  // console.log({ weightedAvgPrice, weightedAvgAverage, prices, averages });

  const priceAdjustTerm = (weightedAvgAverage * 0.2) / days;
  const recommendedGasPrice = Math.round(weightedAvgPrice + priceAdjustTerm);

  return { gwei: recommendedGasPrice };
}

// [value, weight]
function weightedAvg(terms: [number, number][]): number {
  const numerator = terms.reduce((sum, term) => sum + term[0] * term[1], 0);
  const denominator = terms.reduce((sum, term) => sum + term[1], 0);

  return numerator / denominator;
}

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
  const { gwei: minGasPrice } = await estimateGas('7d');

  const network = ethers.utils.getNetwork(1);
  const provider = ethers.getDefaultProvider(network);

  const currentGasPriceBn = await provider.getGasPrice();
  const currentGasPrice = bnToNumber(currentGasPriceBn, GWEI_DECIMALS, 0);
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

function validateGasPriceTimeRange(range: GasPriceTimeRange): void {
  const valid = /[1-7]d/.test(range);

  if (!valid) {
    throw new BadRequestError('Invalid confirmation time');
  }
}

const gasService = {
  estimateGas,
  estimateGasSavings,
};

export { gasService };
