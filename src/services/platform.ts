import { utils } from 'ethers';

import { IPlatform } from '../models/Models';
import Platform from '../models/PlatformSchema';
import { createLogger } from '../logger';

const logger = createLogger('platformService');

async function matchTxToPlatform(tx: string): Promise<IPlatform> {
  logger.debug(`matchTxToPlatform, tx: ${tx}`);
  try {
    const parsed = utils.parseTransaction(tx);
    const to = parsed.to.toLowerCase();
    const data = parsed.data.toLowerCase();
    const platforms = await Platform.find();
    for (const platform of platforms) {
      const whitelistAddresses = platform['whitelist']['ethereum'][parsed.chainId];
      const wildcard = '*';
      const hasWildcard = Object.values(whitelistAddresses).includes(wildcard);
      logger.debug(`whitelistAddresses: ${whitelistAddresses}, ${typeof whitelistAddresses}, ${typeof wildcard}`);
      logger.debug(`varmı: ${Object.values(whitelistAddresses).includes('*')}`);
      logger.debug(`${whitelistAddresses === wildcard}`);

      if (hasWildcard) {
        return platform;
      }
      for (const contract of whitelistAddresses) {
        logger.debug(`contract: ${contract}`);
        const contractLower = contract.toLowerCase();
        const contractNoPrefix = contractLower.substr(2);
        logger.debug(`to: ${to}, contractLower: ${contractLower}, data: ${data}, conNO: ${contractNoPrefix} `);
        if (to === contractLower || data.includes(contractNoPrefix)) {
          return platform;
        }
      }
    }
    logger.debug(`the address is not whitelisted`);
  } catch (e) {
    logger.error(`error: ${e}`);
  }
}

async function matchTxToWebhook(tx: string): Promise<string> {
  const platform = await matchTxToPlatform(tx);

  return platform?.webhook;
}

export default {
  matchTxToPlatform,
  matchTxToWebhook,
};
