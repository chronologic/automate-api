import { Cache } from 'memory-cache';
import { ethers } from 'ethers';

import { ETH_DECIMALS } from './constants';
import { AssetType } from './models/Models';

interface ICache<T> {
  put: (key: string, value: T, ttl?: number) => T;
  get: (key: string) => T;
  keys: () => T[];
}

export function createTimedCache<T>(ttlMillis: number): ICache<T> {
  const cache = new Cache();

  return {
    put: (key: string, value: any, ttl = ttlMillis) => cache.put(key, value, ttl) as any,
    get: (key: string) => cache.get(key) as any,
    keys: () => cache.keys() as any,
  };
}

export function numberToBnEth(num: number): ethers.BigNumber {
  return numberToBn(num, ETH_DECIMALS);
}

export function numberToBn(num: number, decimals = ETH_DECIMALS): ethers.BigNumber {
  let numStr = num.toString();
  const numDecimals = (numStr.split('.')[1] || '').length;

  if (numDecimals > decimals) {
    const decimalPointIndex = numStr.indexOf('.');
    numStr = numStr.substring(0, decimalPointIndex + decimals + 1);
  }

  return ethers.utils.parseUnits(`${numStr}`, decimals);
}

export function bnToNumberEth(bn: ethers.BigNumberish, precision = 6): number {
  return bnToNumber(bn, ETH_DECIMALS, precision);
}

export function bnToNumber(bn: ethers.BigNumberish, decimals = ETH_DECIMALS, precision = 6): number {
  const bnWithPrecision = ethers.BigNumber.from(bn).div(
    ethers.BigNumber.from('10').pow(ethers.BigNumber.from(decimals - precision)),
  );
  return bnWithPrecision.toNumber() / 10 ** precision;
}

export function weiToGwei(wei: ethers.BigNumberish): number {
  return ethers.BigNumber.from(wei)
    .div(10 ** 9)
    .toNumber();
}

export function isTruthy(value: any): boolean {
  return value === 'true' || value === true;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

export async function waitUntil(timestamp: number): Promise<void> {
  const now = Date.now();
  return sleep(timestamp - now);
}

export function decodeMethod(assetType: AssetType, signedTx: string): string {
  if (assetType === AssetType.Ethereum) {
    const { data } = ethers.utils.parseTransaction(signedTx);
    const methodHashLength = 10;
    const methodHash = data.slice(0, methodHashLength);

    return methodHash;
  }

  return '';
}
