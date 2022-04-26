import ShortUniqueId from 'short-unique-id';

import { HOUR_MILLIS } from '../constants';
import { IStrategyPrep, IStrategyPrepResponse, IStrategyPrepTx, IUser, StrategyPrepStatus } from '../models/Models';
import StrategyPrep from '../models/StrategyPrepSchema';

const STRATEGY_PREP_TTL = 2 * HOUR_MILLIS;

const generatePrepId = new ShortUniqueId({ length: 8 });

export const strategyService = {
  prep,
  cancelPrep,
};

async function prep(user: IUser, txs: IStrategyPrepTx[]): Promise<IStrategyPrepResponse> {
  const prepId = generatePrepId();
  const expiresAt = new Date(new Date().getTime() + STRATEGY_PREP_TTL).toISOString();
  const preps = txs.map(
    (tx) =>
      ({
        ...tx,
        prepId,
        userId: user.id,
        status: StrategyPrepStatus.Pending,
        expiresAt,
      } as Partial<IStrategyPrep>),
  );

  await StrategyPrep.insertMany(preps);

  return {
    prepId,
    expiresAt,
  };
}

async function cancelPrep(user: IUser, prepId: string): Promise<void> {
  await StrategyPrep.deleteMany({
    userId: user._id,
    prepId,
  });
}
