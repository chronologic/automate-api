import { utils } from 'ethers';

import { IPlatform } from '../models/Models';
import Platform from '../models/PlatformSchema';
import { createLogger } from '../logger';

const logger = createLogger('platformService');

async function matchTxToPlatform(tx: string): Promise<IPlatform> {
  try {
    const parsed = utils.parseTransaction(tx);
    const to = parsed.to.toLowerCase();
    const data = parsed.data.toLowerCase();
    const platforms = await Platform.find();
    for (const platform of platforms) {
      const platformArbitrum = platform.whitelist.ethereum[parsed.chainId];
      const wildcard = '*';
      if (platformArbitrum === wildcard) {
        return platform;
      }
      for (const contract of platformArbitrum) {
        const contractLower = contract.toLowerCase();
        const contractNoPrefix = contractLower.substr(2);
        if (to === contractLower || data.includes(contractNoPrefix)) {
          return platform;
        }
      }
    }
  } catch (e) {
    logger.error(e);
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
