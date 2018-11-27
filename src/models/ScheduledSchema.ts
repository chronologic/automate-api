import * as mongoose from 'mongoose';

const Schema = mongoose.Schema;

export interface IScheduled extends mongoose.Document {
  signedTransaction: string,
  conditionAsset: string,
  conditionAmount: string,
  completed: boolean,
  transactionHash: string
}

export const ScheduledSchema = new Schema({
  signedTransaction: {
    type: String
  },
  conditionAsset: {
      type: String
  },
  conditionAmount: {
      type: String
  },
  completed: {
    type: Boolean
  },
  transactionHash: {
    type: String
  }
});

const Scheduled = mongoose.model<IScheduled>('Scheduled', ScheduledSchema);
export default Scheduled;