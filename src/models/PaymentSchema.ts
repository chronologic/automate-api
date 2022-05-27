import { model, Schema } from 'mongoose';

import { createLogger } from '../logger';
import { IPayment } from './Models';

const logger = createLogger('PaymentSchema');

const PaymentSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  processed: {
    type: Boolean,
    default: false,
  },
  from: {
    type: String,
    required: true,
  },
  txHash: {
    type: String,
    required: true,
    unique: true,
  },
  blockNumber: {
    type: Number,
  },
  amount: {
    type: Number,
  },
  credits: {
    type: Number,
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

PaymentSchema.pre('save', preSave);

const Payment = model<IPayment>('Payment', PaymentSchema);

export default Payment;
