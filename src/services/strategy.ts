import ShortUniqueId from 'short-unique-id';

import { HOUR_MILLIS } from '../constants';
import { IStrategyPrep, IStrategyPrepResponse, IStrategyPrepTx, IStrategyPrepTxWithConditions } from '../models/Models';
import StrategyPrep from '../models/StrategyPrepSchema';

const STRATEGY_PREP_TTL = 2 * HOUR_MILLIS;

const generateInstanceId = new ShortUniqueId({ length: 8 });

export const strategyService = {
  prep,
  deletePrepTx,
  deletePrepInstance,
  hasAnyPrep,
  matchPrep,
};

async function prep(userId: string, txs: IStrategyPrepTxWithConditions[]): Promise<IStrategyPrepResponse> {
  await deleteAllPrepsForUser(userId); // only allow one prep at a time for a given user

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

async function deletePrepTx(userId: string, strategyPrepId: string): Promise<void> {
  await StrategyPrep.deleteOne({
    userId,
    _id: strategyPrepId,
  });
}

async function deletePrepInstance(userId: string, instanceId: string): Promise<void> {
  await StrategyPrep.deleteMany({
    userId,
    instanceId,
  });
}

async function deleteAllPrepsForUser(userId: string): Promise<void> {
  await StrategyPrep.deleteMany({
    userId,
  });
}

async function hasAnyPrep(userId: string): Promise<boolean> {
  const res = await StrategyPrep.find({ userId, ...makeNotExpiredCondition() });

  return res.length > 0;
}

async function matchPrep(userId: string, prepTx: IStrategyPrepTx): Promise<IStrategyPrep> {
  const res = await StrategyPrep.find({ userId, ...prepTx, ...makeNotExpiredCondition() });

  if (res.length > 1) {
    throw new Error('Found more than 1 match!');
  }

  return res[0];
}

function makeNotExpiredCondition(): any {
  return { expiresAt: { $gte: new Date() } };
}
