import * as mongoose from 'mongoose';

const Schema = mongoose.Schema;

export interface IScheduled extends mongoose.Document {
  signedMessage: string,
  amount: string,
  asset: string,
  tokenCondition: string,
  completed: boolean
}

export const ScheduledSchema = new Schema({
  signedMessage: {
    type: String
  },
  amount: {
    type: String
  },
  asset: {
      type: String
  },
  tokenCondition: {
      type: String
  },
  completed: {
    type: Boolean
}
});

const Scheduled = mongoose.model<IScheduled>('Scheduled', ScheduledSchema);
export default Scheduled;