import { MINUTE_MILLIS } from '../constants';
import { ITxLabel } from '../models/Models';
import TxLabel from '../models/TxLabelSchema';
import { createTimedCache } from '../utils';

const labelCache = createTimedCache<Promise<ITxLabel[]>>(5 * MINUTE_MILLIS);

export async function getLabel({ assetType, chainId, hash }): Promise<string> {
  const txLabels = await getTxLabelsCached();
  const { label } = txLabels.find((l) => l.assetType === assetType && l.chainId === chainId && l.hash === hash) || {};

  return label || '';
}

async function getTxLabelsCached(): Promise<ITxLabel[]> {
  const cacheKey = 'txLabels';
  const cached = labelCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const freshPromise = getTxLabels();
  labelCache.put(cacheKey, freshPromise);

  return freshPromise;
}

async function getTxLabels(): Promise<ITxLabel[]> {
  return TxLabel.find();
}
