import { model, Schema } from 'mongoose';
import { ethers } from 'ethers';

import { createLogger } from '../logger';
import { IStrategyPrep } from './Models';

const logger = createLogger('StrategyPrepSchema');

const StrategyPrepSchema = new Schema({
  instanceId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  scheduledId: {
    type: String,
  },
  assetType: {
    type: String,
    required: true,
  },
  chainId: {
    type: Number,
    required: true,
  },
  from: {
    type: String,
    required: true,
  },
  to: {
    type: String,
    required: true,
  },
  nonce: {
    type: Number,
    required: true,
  },
  data: {
    type: String,
    required: true,
  },
  priority: {
    type: Number,
    required: true,
  },
  conditionAsset: {
    type: String,
  },
  conditionAmount: {
    type: String,
  },
  timeCondition: {
    type: Number,
  },
  timeConditionTZ: {
    type: String,
  },
  expiresAt: {
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
  this.from = this.from.toLowerCase();
  this.to = this.to.toLowerCase();
  this.data = this.data.toLowerCase();

  next();
}

StrategyPrepSchema.pre('save', preSave);

const StrategyPrep = model<IStrategyPrep>('StrategyPrep', StrategyPrepSchema);

export default StrategyPrep;
