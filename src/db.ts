import mongoose from 'mongoose';

import { DB_URI } from './env';

const mongoUrl: string = DB_URI || 'mongodb://root:example@localhost:27017';

export async function connect() {
  return mongoose.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
}

export async function disconnect() {
  await mongoose.disconnect();
}
