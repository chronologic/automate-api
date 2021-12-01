import { ethers } from 'ethers';
import fetch from 'node-fetch';

import { ETH_DECIMALS, MINUTE_MILLIS } from '../constants';
import { createLogger } from '../logger';
import { bnToNumberEth, createTimedCache, numberToBnEth } from '../utils';

interface IPrices {
  ethereum: {
    btc: number;
    usd: number;
  };
}

const logger = createLogger('priceFeed');
const cache = createTimedCache<IPrices>(MINUTE_MILLIS);

async function convertWeiToUsd(wei: ethers.BigNumberish): Promise<number> {
  const ethToUsd = await fetchEthPrice();
  const ratioWei = numberToBnEth(ethToUsd);
  const weiInUsd = ethers.BigNumber.from(wei).mul(ratioWei).div(ethers.BigNumber.from(10).pow(ETH_DECIMALS));
  return bnToNumberEth(weiInUsd);
}

async function fetchEthPrice(): Promise<number> {
  const prices = await fetchPrices();

  const rate = prices.ethereum.usd;
  logger.debug(`ETH => USD rate is: ${rate}`);

  return rate;
}

async function fetchPrices(): Promise<IPrices> {
  const cacheKey = 'prices';
  const cachedVal = cache.get(cacheKey);

  if (cachedVal) {
    logger.debug(`Cached prices are: ${JSON.stringify(cachedVal)}`);
    return cachedVal;
  }

  logger.debug('Fetching prices from coingecko...');
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
  const json = await res.json();
  cache.put(cacheKey, json);

  logger.debug(`Prices are: ${JSON.stringify(json)}`);

  return json;
}

export { convertWeiToUsd, fetchEthPrice };
