import { MINUTE_MILLIS } from '../constants';
import { IScheduled, IScheduledForUser, ITxLabel, ITxLabelParams } from '../models/Models';
import TxLabel from '../models/TxLabelSchema';
import { createTimedCache, decodeMethod } from '../utils';
import { Key } from './key';

const labelCache = createTimedCache<Promise<ITxLabel[]>>(5 * MINUTE_MILLIS);

export async function mapToScheduledForUser(scheduled: IScheduled): Promise<IScheduledForUser> {
  const method = scheduled.method || decodeMethod(scheduled.assetType, scheduled.signedTransaction);
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
    fromLabel: await getLabel({ assetType: scheduled.assetType, chainId: scheduled.chainId, hash: scheduled.from }),
    to: scheduled.to,
    toLabel: await getLabel({ assetType: scheduled.assetType, chainId: scheduled.chainId, hash: scheduled.to }),
    method,
    methodLabel: await getLabel({ assetType: scheduled.assetType, chainId: scheduled.chainId, hash: method }),
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

export async function getLabel({ assetType, chainId, hash }): Promise<string> {
  const txLabels = await getTxLabelsCached();
  const { label } =
    txLabels.find(
      (l) => l.assetType === assetType && l.chainId === chainId && l.hash.toLowerCase() === hash?.toLowerCase(),
    ) || {};

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

export async function addTxLabel(label: ITxLabelParams) {
  return await TxLabel.insertMany([label]);
}
