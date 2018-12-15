import { Document } from 'mongoose';

export enum Status {
  Pending,
  Cancelled,
  Completed,
  Error,
  StaleNonce
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

export interface IExecuteStatus {
  status: Status;
  transactionHash?: string;
  error?: string;
}

export interface IScheduleRequest {
  conditionAmount: string;
  conditionAsset: string;
  signedTransaction: string;
}
