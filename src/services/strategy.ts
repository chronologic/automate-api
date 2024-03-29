import ShortUniqueId from 'short-unique-id';

import { HOUR_MILLIS } from '../constants';
import { createLogger } from '../logger';
import {
  IScheduled,
  IStrategyPrep,
  IStrategyPrepResponse,
  IStrategyPrepTx,
  IStrategyPrepTxWithConditions,
} from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import StrategyPrep from '../models/StrategyPrepSchema';

const logger = createLogger('strategy');

const STRATEGY_PREP_TTL = 2 * HOUR_MILLIS;

const generateInstanceId = new ShortUniqueId({ length: 8 });

export const strategyService = {
  prep,
  deletePrepTx,
  deletePrepInstance,
  hasAnyPrep,
  matchFirstPrep,
  shiftTimeCondition,
};

async function prep(userId: string, txs: IStrategyPrepTxWithConditions[]): Promise<IStrategyPrepResponse> {
  await deleteAllPrepsForUser(userId); // only allow one prep at a time for a given user

  logger.debug(`Deleted all previous preps for user ${userId}`);

  const instanceId = generateInstanceId();
  const expiresAt = new Date(new Date().getTime() + STRATEGY_PREP_TTL).toISOString();
  const preps: Partial<IStrategyPrep>[] = txs.map((tx) => ({
    ...tx,
    from: tx.from.toLowerCase(),
    to: tx.to.toLowerCase(),
    data: tx.data.toLowerCase(),
    instanceId,
    userId,
    expiresAt,
  }));

  await StrategyPrep.insertMany(preps);

  logger.debug(`Created ${preps.length} preps for user ${userId}`);

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

  logger.debug(`Found ${res.length} any preps for user ${userId}`);

  return res.length > 0;
}

async function matchFirstPrep(userId: string, prepTx: IStrategyPrepTx): Promise<IStrategyPrep> {
  const [firstPrep] = await StrategyPrep.find({ userId, ...makeNotExpiredCondition() }).sort({ order: 'asc' });

  if (!firstPrep) {
    return;
  }

  if (isSimilar(prepTx, firstPrep)) {
    return firstPrep;
  }

  throw new Error(
    `Unexpected tx at order ${firstPrep.order}. Expected: ${JSON.stringify(firstPrep)}, got: ${JSON.stringify(prepTx)}`,
  );
}

function isSimilar(source: { [key: string]: any }, target: { [key: string]: any }): boolean {
  Object.keys(source).forEach((key) => {
    if (target[key] !== source[key]) {
      return false;
    }
  });

  return true;
}

function makeNotExpiredCondition(): any {
  return { expiresAt: { $gte: new Date().toISOString() } };
}

async function shiftTimeCondition(scheduled: IScheduled) {
  if (!scheduled.strategyInstanceId) {
    logger.debug(`tx ${scheduled._id} is not part of a strategy`);
    return;
  }

  const nextTxsInIterationCount = await Scheduled.count({
    userId: scheduled.userId,
    strategyInstanceId: scheduled.strategyInstanceId,
    strategyPrepIteration: scheduled.strategyPrepIteration,
    strategyPrepPosition: { $gt: scheduled.strategyPrepPosition },
    nonce: { $gt: scheduled.nonce },
  });

  const hasNextTxsInIteration = nextTxsInIterationCount > 0;

  if (hasNextTxsInIteration) {
    logger.debug(`tx ${scheduled._id} is not last in iteration`);
    return;
  }

  const nextIteration = scheduled.strategyPrepIteration + 1;
  const nextIterationTxs = await Scheduled.find({
    userId: scheduled.userId,
    strategyInstanceId: scheduled.strategyInstanceId,
    strategyPrepIteration: nextIteration,
    nonce: { $gt: scheduled.nonce },
  }).sort({ strategyPrepPosition: 'asc' });

  const hasNextIterationTxs = nextIterationTxs.length > 0;
  if (!hasNextIterationTxs) {
    logger.debug(`tx ${scheduled._id} has no txs in next iteration (${nextIteration})`);
    return;
  }

  const lastTxInNextIteration = nextIterationTxs[nextIterationTxs.length - 1];

  for (const tx of nextIterationTxs) {
    logger.debug(
      `updating ${tx._id} (nonce ${tx.nonce}, priority ${tx.priority}) time condition from ${new Date(
        tx.timeCondition,
      ).toISOString()} (${tx.timeConditionTZ}) to ${new Date(scheduled.timeCondition).toISOString()} (${
        scheduled.timeConditionTZ
      })`,
    );
    await Scheduled.updateOne(
      { _id: tx._id },
      { timeCondition: scheduled.timeCondition, timeConditionTZ: scheduled.timeConditionTZ },
    );
  }

  await shiftTimeCondition(lastTxInNextIteration);
}
