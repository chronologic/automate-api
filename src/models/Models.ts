import { Document } from 'mongoose';

export enum Status {
  Pending,
  Cancelled,
  Completed,
  Error
}

export interface IScheduled extends Document {
  signedTransaction: string;
  conditionAsset: string;
  conditionAmount: string;
  status: Status;
  transactionHash: string;
  error: string;
  from: string;
  nonce: number;
  chainId: number;
}