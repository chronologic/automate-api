import { model, Schema } from 'mongoose';

import { createLogger } from '../logger';
import { IUser } from './Models';

const logger = createLogger('UserSchema');

const UserSchema = new Schema({
  login: {
    type: String,
    required: true,
    unique: true,
  },
  source: {
    type: String,
  },
  credits: {
    type: Number,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  salt: {
    type: String,
    required: true,
  },
  apiKey: {
    type: String,
    required: true,
  },
  accessKey: {
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

UserSchema.pre('save', preSave);

const User = model<IUser>('User', UserSchema);

export default User;
