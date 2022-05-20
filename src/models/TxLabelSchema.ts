import { model, Schema } from 'mongoose';
import { ChainId } from '../constants';

import { createLogger } from '../logger';
import { AssetType, ITxLabel } from './Models';

const logger = createLogger('TxLabelSchema');

const TxLabelSchema = new Schema({
  assetType: {
    type: AssetType,
    required: true,
  },
  chainId: {
    type: ChainId,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  hash: {
    type: String,
    required: true,
  },
  label: {
    type: String,
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
  this.updatedAt = new Date().toISOString();

  next();
}

TxLabelSchema.pre('save', preSave);

const TxLabel = model<ITxLabel>('TxLabel', TxLabelSchema);

export default TxLabel;
