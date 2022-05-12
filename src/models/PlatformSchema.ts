import { model, Schema } from 'mongoose';

import { createLogger } from '../logger';
import { IPlatform } from './Models';

const logger = createLogger('PlatformSchema');

const PlatformSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  credits: {
    type: Number,
  },
  whitelist: {
    type: Map,
    of: {
      type: Map,
      of: [String],
    },
  },
  webhook: {
    type: String,
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

PlatformSchema.pre('save', preSave);

const Platform = model<IPlatform>('Platform', PlatformSchema);

export default Platform;
