import * as mongoose from 'mongoose';
import { ethers } from 'ethers';

const Schema = mongoose.Schema;

export enum Status {
  Pending,
  Cancelled,
  Completed,
  Error
}

export interface IScheduled extends mongoose.Document {
  signedTransaction: string;
  conditionAsset: string;
  conditionAmount: string;
  status: Status;
  transactionHash: string;
  error: string;
}

export const ScheduledSchema = new Schema({
  signedTransaction: {
    type: String,
    validate: [
      {
        validator: async (tx: string) => {
          try {
            const parsed = ethers.utils.parseTransaction(tx);

            return !!parsed.from && !!parsed.r;
          } catch (e) {
            console.error(e);
            return false;
          }
        },
        msg: 'Invalid signed transaction: Signature is missing'
      },
      {
        validator: async (tx: string) => {
          try {
            const parsed = ethers.utils.parseTransaction(tx);
            const network = ethers.utils.getNetwork(parsed.chainId);
            
            const nonce = await ethers
              .getDefaultProvider(network)
              .getTransactionCount(parsed.from);

            return parsed.nonce >= nonce;
          } catch (e) {
            console.error(e);
            return false;
          }
        },
        msg: 'Invalid signed transaction: Signed nonce is lower than account nonce'
      },
    ],
    required: [true, 'Signed Transaction is required']
  },
  conditionAsset: {
    type: String,
    validate: {
      validator: (conditionAsset: string) => {
        if (!conditionAsset) {
          //ETH
          return true;
        }
        try {
          ethers.utils.getAddress(conditionAsset);
        } catch (e) {
          return false;
        }

        return true;
      },
      message: 'Invalid address'
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
      message: 'Invalid amount'
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
  },
  error: {
    type: String
  }
});

const Scheduled = mongoose.model<IScheduled>('Scheduled', ScheduledSchema);
export default Scheduled;
