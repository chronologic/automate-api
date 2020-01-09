import { Document } from 'mongoose';

export enum Status {
  Pending,
  Cancelled,
  Completed,
  Error,
  StaleNonce,
  PendingConfirmations,
}

export enum AssetType {
  Ethereum = 'ethereum',
  Polkadot = 'polkadot',
}

export enum PolkadotChainId {
  Kusama = 0,
}

export interface IScheduled extends Document {
  assetType: AssetType;
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
  assetName: string;
  assetAmount: number;
  assetValue: number;
  createdAt: string;
  executedAt: string;
}

export interface IExecuteStatus {
  status: Status;
  transactionHash?: string;
  error?: string;
  executedAt?: string;
  assetName?: string;
  assetAmount?: number;
  assetValue?: number;
}

export interface IScheduleRequest {
  conditionAmount: string;
  conditionAsset: string;
  signedTransaction: string;
  timeCondition: number;
  timeConditionTZ: string;
}

export interface ITransactionMetadata {
  assetName: string;
  assetAmount: number;
  assetValue: number;
  executedAt: string;
}

export interface IPolkadotTx {
  signer: string;
  nonce: number;
  chainId: number;
  hash: string;
  dest?: string;
  value?: number;
}
