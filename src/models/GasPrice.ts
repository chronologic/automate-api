import { model, Schema } from 'mongoose';

import { ChainId } from '../constants';
import { createLogger } from '../logger';
import { AssetType, IGasPrice } from './Models';

const logger = createLogger('GasPriceSchema');

const GasPriceSchema = new Schema({
  assetType: {
    type: AssetType,
    required: true,
  },
  chainId: {
    type: ChainId,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: String,
  },
  updatedAt: {
    type: String,
  },
});

// do not change this to lambda, otherwise the apply doesn't set the this context correctly !!!
async function preSave(next: () => {}) {
  this.createdAt = this.createdAt || new Date().toISOString();

  next();
}

GasPriceSchema.pre('save', preSave);

const GasPrice = model<IGasPrice>('GasPrice', GasPriceSchema);

export default GasPrice;
