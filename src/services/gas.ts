import { ethers } from 'ethers';

import { ChainId, HOUR_MILLIS, MINUTE_MILLIS } from '../constants';
import GasPrice from '../models/GasPrice';
import { AssetType } from '../models/Models';
import { sleep } from '../utils';
import { getProvider } from './ethereum/utils';
import { createLogger } from './logger';

interface IChainToMonitor {
  assetType: AssetType;
  chainId: ChainId;
  provider: {
    getGasPrice: () => Promise<ethers.BigNumber>;
  };
}

const logger = createLogger('gas');

const DAY_MILLIS = 24 * HOUR_MILLIS;
const PRICE_TTL = 7 * DAY_MILLIS;

const chainsToMonitor: IChainToMonitor[] = [
  { assetType: AssetType.Ethereum, chainId: ChainId.Ethereum, provider: getProvider(ChainId.Ethereum) },
  { assetType: AssetType.Ethereum, chainId: ChainId.Arbitrum, provider: getProvider(ChainId.Arbitrum) },
];

async function init(): Promise<void> {
  logger.info('Starting price monitor...');
  await updatePeriodically();
}

async function removeExpiredPrices() {
  logger.debug('Removing expired prices...');
  const cutoffDate = new Date(Date.now() - PRICE_TTL).toISOString();
  const res = await GasPrice.remove({ createdAt: { $lte: cutoffDate } });
  logger.debug(`Removed ${res.deletedCount} expired prices`);
}

async function updatePeriodically(): Promise<void> {
  try {
    await Promise.all([updatePrices(), removeExpiredPrices(), sleep(30 * MINUTE_MILLIS)]);
  } catch (e) {
    logger.error(e);
  }
  updatePeriodically();
}

async function updatePrices(): Promise<void> {
  logger.debug('Updating gas prices...');
  await Promise.all(chainsToMonitor.map((config) => updatePriceForChain(config)));
  logger.debug('Updated gas prices');
}

async function updatePriceForChain(config: IChainToMonitor): Promise<void> {
  try {
    const priceWei = await config.provider.getGasPrice();
    const price = Number(ethers.utils.formatUnits(priceWei, 'gwei'));

    logger.debug(`gas price for ${config.assetType} chain ${config.chainId} is ${priceWei} wei (${price} gwei)`);

    await GasPrice.create({
      assetType: config.assetType,
      chainId: config.chainId,
      price,
    });
  } catch (e) {
    logger.error(e);
  }
}

export default {
  init,
};
