import ShortUniqueId from 'short-unique-id';

import { HOUR_MILLIS } from '../constants';
import { IStrategyPrep, IStrategyPrepResponse, IStrategyPrepTx } from '../models/Models';
import StrategyPrep from '../models/StrategyPrepSchema';

const STRATEGY_PREP_TTL = 2 * HOUR_MILLIS;

const generateInstanceId = new ShortUniqueId({ length: 8 });

export const strategyService = {
  prep,
  cancelPrep,
  matchPrep,
};

async function prep(userId: string, txs: IStrategyPrepTx[]): Promise<IStrategyPrepResponse> {
  await cancelPrepForUser(userId); // only allow one prep at a time for a given user

  const instanceId = generateInstanceId();
  const expiresAt = new Date(new Date().getTime() + STRATEGY_PREP_TTL).toISOString();
  const preps: Partial<IStrategyPrep>[] = txs.map((tx) => ({
    ...tx,
    instanceId,
    userId,
    expiresAt,
  }));

  await StrategyPrep.insertMany(preps);

  return {
    instanceId,
    expiresAt,
  };
}

async function cancelPrep(userId: string, instanceId: string): Promise<void> {
  await StrategyPrep.deleteMany({
    userId,
    instanceId,
  });
}

async function cancelPrepForUser(userId: string): Promise<void> {
  await StrategyPrep.deleteMany({
    userId,
  });
}

async function matchPrep(userId: string, prepTx: IStrategyPrepTx): Promise<IStrategyPrep> {
  const res = await StrategyPrep.find({ userId, ...prepTx });

  if (res.length > 1) {
    throw new Error('Found more than 1 match!');
  }

  return res[0];
}
