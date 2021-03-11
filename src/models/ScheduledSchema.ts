import { ethers } from 'ethers';
import { model, Schema } from 'mongoose';

import { makeLogger } from '../services/logger';
import getApi from '../services/polkadot/api';
import { AssetType, IScheduled, Status } from './Models';

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
  assetValue: {
    type: Number,
  },
  createdAt: {
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
  userId: {
    type: String,
  },
  notes: {
    type: String,
  },
});

// do not change this to lambda, otherwise the apply doesn't set the this context correctly !!!
async function preSave(next: () => {}) {
  switch (this.assetType) {
    case AssetType.Ethereum:
    case undefined: {
      const parsed = ethers.utils.parseTransaction(this.signedTransaction);
      this.from = (parsed.from || '').toLowerCase();
      this.to = (parsed.to || '').toLowerCase();
      this.nonce = parsed.nonce;
      this.chainId = parsed.chainId;
      this.transactionHash = parsed.hash;

      // TODO: extract ERC20 data using code below
      /*

    try {
      const { name, decimals } = await TokenAPI.tokenInfo(
        signedRecipient,
        decodedTransaction.chainId
      );

      const callDataParameters = '0x' + decodedTransaction.data.substring(10);
      const params = ethers.utils.defaultAbiCoder.decode(
        ['address', 'uint256'],
        callDataParameters
      );

      signedAddress = decodedTransaction.to!;
      signedAssetName = name;
      signedAssetDecimals = decimals;
      signedRecipient = params[0];
      signedAmount = TokenAPI.withDecimals(params[1], decimals);
      // tslint:disable-next-line:no-empty
    } catch (e) {}
    */

      break;
    }
    case AssetType.Polkadot: {
      const api = await getApi(this.chainId);
      const { signer, nonce, chainId, hash } = await api.parseTx(
        this.signedTransaction,
      );
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
