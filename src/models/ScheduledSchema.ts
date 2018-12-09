import { ethers } from 'ethers';
import { model, Schema } from 'mongoose';
import { IScheduled, Status } from './Models';
import { Transaction } from '../services/transaction';

const ScheduledSchema = new Schema({
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
            const sender = {
              chainId: parsed.chainId,
              from: parsed.from!
            }
            const senderNonce = await Transaction.getSenderNextNonce(sender);

            return parsed.nonce >= senderNonce;
          } catch (e) {
            console.error(e);
            return false;
          }
        },
        msg:
          'Invalid signed transaction: Signed nonce is lower than account nonce'
      }
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
  from: {
    type: String
  },
  nonce: {
    type: Number
  },
  transactionHash: {
    type: String
  },
  chainId: {
    type: Number
  },
  status: {
    type: Status
  },
  error: {
    type: String
  }
});

// do not change this to lambda, otherwise the apply doesn't set the this context correctly !!!
function preSave(next: any) {
  const parsed = ethers.utils.parseTransaction(this.signedTransaction);

  this.from = parsed.from!;
  this.nonce = parsed.nonce;
  this.chainId = parsed.chainId;

  next();
}

ScheduledSchema.pre('save', preSave);

const Scheduled = model<IScheduled>('Scheduled', ScheduledSchema);

export default Scheduled;
