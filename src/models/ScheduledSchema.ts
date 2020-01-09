import { ethers } from 'ethers';
import { model, Schema } from 'mongoose';

import * as ethUtils from '../services/ethereum/utils';
import makeLogger from '../services/logger';
import * as polkadotUtils from '../services/polkadot/utils';
import { AssetType, IScheduled, PolkadotChainId, Status } from './Models';
const logger = makeLogger('ScheduledSchema');

const ScheduledSchema = new Schema({
  assetType: {
    type: AssetType,
    required: true,
  },
  signedTransaction: {
    required: [true, 'Signed Transaction is required'],
    type: String,
    validate: [
      {
        msg: 'Invalid signed transaction: Signature is missing',
        async validator(tx: string) {
          try {
            switch (this.assetType) {
              case AssetType.Ethereum:
              case undefined: {
                const parsed = ethers.utils.parseTransaction(tx);

                return !!parsed.from && !!parsed.r;
              }
              default: {
                return true;
              }
            }
          } catch (e) {
            logger.error(e);
            return false;
          }
        },
      },
      {
        msg:
          'Invalid signed transaction: Signed nonce is lower than account nonce',
        async validator(tx: string) {
          try {
            switch (this.assetType) {
              case AssetType.Ethereum:
              case undefined: {
                const parsed = ethers.utils.parseTransaction(tx);
                const sender = {
                  chainId: parsed.chainId,
                  from: parsed.from!,
                };
                const senderNonce = await ethUtils.getSenderNextNonce(sender);

                return parsed.nonce >= senderNonce;
              }
              case AssetType.Polkadot: {
                const { signer, nonce } = await polkadotUtils.parseTx(tx);
                const senderNonce = await polkadotUtils.getSenderNextNonce(
                  signer,
                );

                return nonce >= senderNonce;
              }
              default: {
                return true;
              }
            }
          } catch (e) {
            logger.error(e);
            return false;
          }
        },
      },
    ],
  },
  conditionAsset: {
    type: String,
    validate: {
      msg: 'Invalid address',
      validator(conditionAsset: string) {
        if (!conditionAsset) {
          return true;
        }
        try {
          switch (this.assetType) {
            case AssetType.Ethereum:
            case undefined: {
              return !!ethers.utils.getAddress(conditionAsset);
            }
            default: {
              return true;
            }
          }
        } catch (e) {
          return false;
        }
      },
    },
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
      },
    },
  },
  timeCondition: {
    required: [true, 'Time condition is required'],
    type: Number,
  },
  timeConditionTZ: {
    type: String,
  },
  from: {
    type: String,
  },
  nonce: {
    type: Number,
  },
  transactionHash: {
    type: String,
  },
  chainId: {
    type: Number,
  },
  status: {
    type: Status,
  },
  error: {
    type: String,
  },
  conditionBlock: {
    type: Number,
    default: 0,
  },
  assetName: {
    type: String,
  },
  assetAmount: {
    type: Number,
  },
  assetValue: {
    type: Number,
  },
  createdAt: {
    type: String,
  },
  executedAt: {
    type: String,
  },
});

// do not change this to lambda, otherwise the apply doesn't set the this context correctly !!!
async function preSave(next: () => {}) {
  switch (this.assetType) {
    case AssetType.Ethereum:
    case undefined: {
      const parsed = ethers.utils.parseTransaction(this.signedTransaction);
      this.from = parsed.from!;
      this.nonce = parsed.nonce;
      this.chainId = parsed.chainId;

      break;
    }
    case AssetType.Polkadot: {
      const { signer, nonce, chainId } = await polkadotUtils.parseTx(
        this.signedTransaction,
      );
      this.from = signer;
      this.nonce = nonce;
      this.chainId = chainId;

      break;
    }
  }

  next();
}

ScheduledSchema.pre('save', preSave);

const Scheduled = model<IScheduled>('Scheduled', ScheduledSchema);

export default Scheduled;
