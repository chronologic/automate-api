import { model, Schema } from 'mongoose';

import { makeLogger } from '../services/logger';
import { IUser } from './Models';

const logger = makeLogger('UserSchema');

const UserSchema = new Schema({
  login: {
    type: String,
    required: true,
    unique: true,
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
});

const User = model<IUser>('User', UserSchema);

export default User;
