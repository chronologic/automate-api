import { utils } from 'ethers';

import { AssetType, IPlatform } from '../models/Models';
import Platform from '../models/PlatformSchema';
import { createLogger } from '../logger';

const logger = createLogger('platformService');

async function matchTxToPlatform(tx: string, assetType: AssetType): Promise<IPlatform> {
  try {
    const parsed = utils.parseTransaction(tx);
    const to = parsed.to.toLowerCase();
    const data = parsed.data.toLowerCase();
    const platforms = await Platform.find();
    for (const platform of platforms) {
      const whitelistAddresses = platform.whitelist.get(assetType)?.get(parsed.chainId.toString()) || [];
      const wildcard = '*';
      const hasWildcard = Object.values(whitelistAddresses).includes(wildcard);
      if (hasWildcard) {
        return platform;
      }
      for (const contract of whitelistAddresses) {
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

async function matchTxToWebhook(tx: string, assetType: AssetType): Promise<string> {
  const platform = await matchTxToPlatform(tx, assetType);

  return platform?.webhook;
}

export default {
  matchTxToPlatform,
  matchTxToWebhook,
};
