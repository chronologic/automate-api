import { Document } from 'mongoose';

export enum Status {
  Pending,
  Cancelled,
  Completed,
  Error,
  StaleNonce,
  PendingConfirmations
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
  conditionBlock: number;
  timeCondition: number;
  timeConditionTZ: string;
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
  timeCondition: number;
}
