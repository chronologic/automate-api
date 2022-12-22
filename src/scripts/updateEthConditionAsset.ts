import { connect } from '../db';
import Scheduled from '../models/ScheduledSchema';

main();

async function main() {
  await connect();
  const res = await Scheduled.updateMany(
    { conditionAsset: { $eq: '' }, conditionAmount: { $exists: true, $ne: '0' } },
    { conditionAsset: 'eth' },
  );

  console.log(res);
}
