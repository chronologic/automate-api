import { Cache } from 'memory-cache';
import { ethers } from 'ethers';

import { ETH_DECIMALS } from './constants';
import { IScheduled, IScheduledForUser } from './models/Models';
import { Key } from './services/key';

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

export function mapToScheduledForUser(scheduled: IScheduled): IScheduledForUser {
  return {
    id: scheduled.id,
    assetAmount: scheduled.assetAmount,
    assetName: scheduled.assetName,
    assetType: scheduled.assetType,
    assetValue: scheduled.assetValue,
    assetContract: scheduled.assetContract,
    assetDecimals: scheduled.assetDecimals,
    chainId: scheduled.chainId,
    conditionAmount: scheduled.conditionAmount,
    conditionAsset: scheduled.conditionAsset,
    conditionAssetDecimals: scheduled.conditionAssetDecimals,
    conditionAssetName: scheduled.conditionAssetName,
    conditionBlock: scheduled.conditionBlock,
    createdAt: scheduled.createdAt,
    error: scheduled.error,
    executedAt: scheduled.executedAt,
    executionAttempts: scheduled.executionAttempts,
    from: scheduled.from,
    to: scheduled.to,
    gasPrice: scheduled.gasPrice,
    gasPriceAware: scheduled.gasPriceAware,
    lastExecutionAttempt: scheduled.lastExecutionAttempt,
    nonce: scheduled.nonce,
    signedTransaction: scheduled.signedTransaction,
    status: scheduled.status,
    timeCondition: scheduled.timeCondition,
    timeConditionTZ: scheduled.timeConditionTZ,
    transactionHash: scheduled.transactionHash,
    txKey: Key.generate(scheduled._id),
    notes: scheduled.notes,
    gasPaid: scheduled.gasPaid,
    gasSaved: scheduled.gasSaved,
  };
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
