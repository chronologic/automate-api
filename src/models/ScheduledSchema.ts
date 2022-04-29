import { BigNumber, ethers } from 'ethers';
import { model, Schema } from 'mongoose';

import { createLogger } from '../logger';
import getApi from '../services/polkadot/api';
import { AssetType, IScheduled, Status } from './Models';

const logger = createLogger('ScheduledSchema');

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
        msg: 'Invalid signed transaction: Signed nonce is lower than account nonce',
        async validator(tx: string) {
          try {
            return true;
            // tslint:disable-next-line: no-console
            // console.log(this, {
            //   assetTypes: [AssetType.Ethereum, AssetType.Polkadot],
            // });
            // switch (this.assetType) {
            //   case AssetType.Ethereum:
            //   case undefined: {
            //     const parsed = ethers.utils.parseTransaction(tx);
            //     const sender = {
            //       chainId: parsed.chainId,
            //       from: parsed.from!,
            //     };
            //     const senderNonce = await ethUtils.getSenderNextNonce(sender);

            //     return parsed.nonce >= senderNonce;
            //   }
            //   case AssetType.Polkadot: {
            //     const api = await getApi(this.chainId);
            //     const { signer, nonce } = await api.parseTx(tx);
            //     const senderNonce = await api.getNextNonce(signer);

            //     return nonce >= senderNonce;
            //   }
            //   default: {
            //     return true;
            //   }
            // }
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
          BigNumber.from(conditionAmount);
        } catch (e) {
          return false;
        }

        return true;
      },
    },
  },
  conditionAssetName: {
    type: String,
  },
  conditionAssetDecimals: {
    type: Number,
  },
  timeCondition: {
    required: [true, 'Time condition is required'],
    type: Number,
  },
  timeConditionTZ: {
    type: String,
  },
  gasPrice: {
    type: String,
  },
  gasPriceAware: {
    type: Boolean,
  },
  executionAttempts: {
    type: Number,
  },
  lastExecutionAttempt: {
    type: String,
  },
  from: {
    type: String,
  },
  to: {
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
  assetAmountWei: {
    type: String,
  },
  assetDecimals: {
    type: Number,
  },
  assetValue: {
    type: Number,
  },
  assetContract: {
    type: String,
  },
  createdAt: {
    type: String,
  },
  updatedAt: {
    type: String,
  },
  executedAt: {
    type: String,
  },
  paymentEmail: {
    type: String,
  },
  paymentRefundAddress: {
    type: String,
  },
  paymentAddress: {
    type: String,
  },
  paymentTx: {
    type: String,
  },
  priority: {
    type: Number,
  },
  userId: {
    type: String,
  },
  strategyInstanceId: {
    type: String,
  },
  notes: {
    type: String,
  },
  gasPaid: {
    type: Number,
  },
  gasSaved: {
    type: Number,
  },
  scheduledEthPrice: {
    type: Number,
  },
  scheduledGasPrice: {
    type: Number,
  },
  executedEthPrice: {
    type: Number,
  },
  executedGasPrice: {
    type: Number,
  },
});

// do not change this to lambda, otherwise the apply doesn't set the this context correctly !!!
async function preSave(next: () => {}) {
  this.createdAt = this.createdAt || new Date().toISOString();
  this.updatedAt = new Date().toISOString();

  switch (this.assetType) {
    case AssetType.Ethereum:
    case undefined: {
      const parsed = ethers.utils.parseTransaction(this.signedTransaction);
      this.from = (parsed.from || '').toLowerCase();
      this.to = (parsed.to || '').toLowerCase();
      this.nonce = parsed.nonce;
      this.chainId = parsed.chainId;
      this.transactionHash = parsed.hash;
      // TODO: handle this better
      this.gasPrice = parsed.gasPrice || parsed.maxFeePerGas.add(parsed.maxPriorityFeePerGas);

      if (this.conditionAsset && this.conditionAsset !== 'eth') {
        try {
          const callDataParameters = '0x' + parsed.data.substring(10);
          const params = ethers.utils.defaultAbiCoder.decode(['address', 'uint256'], callDataParameters);

          // exclude addresses like 0x0...0 0x0...1 etc
          if (/[^01x]+/i.test(params[0])) {
            this.to = params[0];
          }
        } catch (e) {}
      }

      break;
    }
    case AssetType.Polkadot: {
      const api = await getApi(this.chainId);
      const { signer, nonce, chainId, hash } = await api.parseTx(this.signedTransaction);
      this.from = signer;
      this.nonce = nonce;
      this.chainId = chainId;
      this.transactionHash = hash;

      break;
    }
  }

  next();
}

ScheduledSchema.pre('save', preSave);

const Scheduled = model<IScheduled>('Scheduled', ScheduledSchema);

export default Scheduled;
