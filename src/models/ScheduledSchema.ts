import * as mongoose from 'mongoose';
import { ethers } from 'ethers';

const Schema = mongoose.Schema;

export enum Status {
  Pending, Cancelled, Completed
}

export interface IScheduled extends mongoose.Document {
  signedTransaction: string;
  conditionAsset: string;
  conditionAmount: string;
  status: Status;
  transactionHash: string;
}

export const ScheduledSchema = new Schema({
  signedTransaction: {
    type: String,
    validate: {
      validator: async (tx: string) => {
        try {
          const parsed = ethers.utils.parseTransaction(tx);

          if (!!parsed.from && !!parsed.r) {
            const network = ethers.utils.getNetwork(parsed.chainId);
            const nonce = await ethers
              .getDefaultProvider(network)
              .getTransactionCount(parsed.from);
            
            console.log(`ScheduledSchema:::signedTransaction:::validate:::Parsed nonce ${parsed.nonce} account nonce ${nonce}`)
            return nonce === parsed.nonce;
          }
        } catch (e) {
          console.error(e);
          return false;
        }

        return false;
      },
      message: (props: any) => 'Invalid signed transaction'
    },
    required: [true, 'Signed Transaction is required']
  },
  conditionAsset: {
    type: String,
    required: [true, 'Condition asset is required'],
    validate: {
      validator: (conditionAsset: string) => {
        try {
          ethers.utils.getAddress(conditionAsset);
        } catch (e) {
          return false;
        }

        return true;
      },
      message: () => 'Invalid address'
    }
  },
  conditionAmount: {
    type: String,
    required: [true, 'Condition amount is required'],
    validate: {
      validator: (conditionAmount: string) => {
        try {
          new ethers.utils.BigNumber(conditionAmount);
        } catch (e) {
          return false;
        }

        return true;
      },
      message: () => 'Invalid amount'
    }
  },
  completed: {
    type: Boolean
  },
  transactionHash: {
    type: String
  },
  status: {
    type: Status
  }
});

const Scheduled = mongoose.model<IScheduled>('Scheduled', ScheduledSchema);
export default Scheduled;
