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
import StrategyPrep from '../models/StrategyPrepSchema';

const logger = createLogger('strategy');

const STRATEGY_PREP_TTL = 2 * HOUR_MILLIS;

const generateInstanceId = new ShortUniqueId({ length: 8 });

export const strategyService = {
  prep,
  deletePrepTx,
  deletePrepInstance,
  hasAnyPrep,
  matchPrep,
  isLastPrepForNonce,
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

async function matchPrep(userId: string, prepTx: IStrategyPrepTx): Promise<IStrategyPrep> {
  const res = await StrategyPrep.find({ userId, ...prepTx, ...makeNotExpiredCondition() });

  logger.debug(`Found ${res.length} matched preps for user ${userId} and tx ${JSON.stringify(prepTx)}`);

  if (res.length > 1) {
    throw new Error('Found more than 1 match!');
  }

  return res[0];
}

async function isLastPrepForNonce(transaction: IScheduled): Promise<boolean> {
  const res = await StrategyPrep.find({
    userId: transaction.userId,
    instanceId: transaction.strategyInstanceId,
    nonce: transaction.nonce,
  }).sort({ nonce: 1 });

  const prepIndex = res.findIndex((item) => item.id === transaction.strategyPrepId);
  const isLastPrep = prepIndex != null && prepIndex === res.length - 1;

  logger.debug(
    `Tx ${transaction._id} is${isLastPrep ? ' ' : ' NOT '}last prep for nonce ${transaction.nonce} for user ${
      transaction.userId
    }`,
  );

  return isLastPrep;
}

function makeNotExpiredCondition(): any {
  return { expiresAt: { $gte: new Date().toISOString() } };
}
