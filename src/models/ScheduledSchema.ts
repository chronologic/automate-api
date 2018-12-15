import { ethers } from 'ethers';
import { model, Schema } from 'mongoose';

import logger from '../services/logger';
import { TransactionExecutor } from '../services/transaction';
import { IScheduled, Status } from './Models';

const ScheduledSchema = new Schema({
  signedTransaction: {
    required: [true, 'Signed Transaction is required'],
    type: String,
    validate: [
      {
        msg: 'Invalid signed transaction: Signature is missing',
        validator: async (tx: string) => {
          try {
            const parsed = ethers.utils.parseTransaction(tx);

            return !!parsed.from && !!parsed.r;
          } catch (e) {
            logger.error(e);
            return false;
          }
        }
      },
      {
        msg:
          'Invalid signed transaction: Signed nonce is lower than account nonce',
        validator: async (tx: string) => {
          try {
            const parsed = ethers.utils.parseTransaction(tx);
            const sender = {
              chainId: parsed.chainId,
              from: parsed.from!
            };
            const senderNonce = await TransactionExecutor.getSenderNextNonce(
              sender
            );

            return parsed.nonce >= senderNonce;
          } catch (e) {
            logger.error(e);
            return false;
          }
        }
      }
    ]
  },
  conditionAsset: {
    type: String,
    validate: {
      msg: 'Invalid address',
      validator: (conditionAsset: string) => {
        if (!conditionAsset) {
          return true;
        }
        try {
          ethers.utils.getAddress(conditionAsset);
        } catch (e) {
          return false;
        }

        return true;
      }
    }
  },
  conditionAmount: {
    required: [true, 'Condition amount is required'],
    type: String,
    validate: {
      msg: 'Invalid amount',
      validator: (conditionAmount: string) => {
        try {
          // tslint:disable-next-line:no-unused-expression
          new ethers.utils.BigNumber(conditionAmount);
        } catch (e) {
          return false;
        }

        return true;
      }
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
