import { ApiPromise } from '@polkadot/api';
import BigNumber from 'bignumber.js';
import { Document } from 'mongoose';

export enum Status {
  Pending,
  Cancelled,
  Completed,
  Error,
  StaleNonce,
  PendingConfirmations,
  PendingPayment,
  PendingPaymentConfirmations,
  PaymentExpired,
  Draft,
}

export enum AssetType {
  Ethereum = 'ethereum',
  Polkadot = 'polkadot',
}

export enum PolkadotChainId {
  PolkadotMainnet = 1,
  EdgewareMainnet = 2,
}

export interface IExtendedPolkadotAPI extends ApiPromise {
  chainName: string;
  getNextNonce(address: string): Promise<number>;
  getBalance(address: string): Promise<BigNumber>;
  txToExtrinsic(tx: string): Promise<any>;
  parseTx(tx: string): Promise<IPolkadotTx>;
  fetchTransactionMetadata(
    transaction: IScheduled,
  ): Promise<ITransactionMetadata>;
}

export interface IScheduled extends Document {
  assetType: AssetType;
  signedTransaction: string;
  conditionAsset: string;
  conditionAssetDecimals: number;
  conditionAssetName: string;
  conditionAmount: string;
  status: Status;
  transactionHash: string;
  error: string;
  from: string;
  to: string;
  nonce: number;
  chainId: number;
  conditionBlock: number;
  timeCondition: number;
  timeConditionTZ: string;
  gasPrice: string;
  gasPriceAware: boolean;
  executionAttempts: number;
  lastExecutionAttempt: string;
  assetName: string;
  assetAmount: number;
  assetValue: number;
  createdAt: string;
  executedAt: string;
  paymentEmail: string;
  paymentRefundAddress: string;
  paymentAddress: string;
  paymentTx: string;
  userId?: string;
  notes?: string;
}

export interface IScheduledForUser {
  id: string;
  assetType: AssetType;
  signedTransaction: string;
  conditionAsset: string;
  conditionAssetDecimals: number;
  conditionAssetName: string;
  conditionAmount: string;
  status: Status;
  transactionHash: string;
  error: string;
  from: string;
  to: string;
  nonce: number;
  chainId: number;
  conditionBlock: number;
  timeCondition: number;
  timeConditionTZ: string;
  gasPrice: string;
  gasPriceAware: boolean;
  executionAttempts: number;
  lastExecutionAttempt: string;
  assetName: string;
  assetAmount: number;
  assetValue: number;
  createdAt: string;
  executedAt: string;
  txKey: string;
  notes: string;
}

export interface IExecuteStatus {
  status: Status;
  transactionHash?: string;
  error?: string;
  executedAt?: string;
  assetName?: string;
  assetAmount?: number;
  assetValue?: number;
  executionAttempts?: number;
  lastExecutionAttempt?: string;
}

export interface IScheduleRequest {
  conditionAmount: string;
  conditionAsset: string;
  gasPriceAware: boolean;
  notes: string;
  signedTransaction: string;
  timeCondition: number;
  timeConditionTZ: string;
  paymentEmail: string;
  paymentRefundAddress: string;
}

export interface IScheduleParams {
  apiKey: string;
  draft?: boolean;
}

export interface ITransactionMetadata {
  assetName: string;
  assetAmount: number;
  assetValue: number;
  executedAt: string;
}
export interface IAssetMetadata {
  name: string;
  decimals: number;
}

export interface IPolkadotTx {
  signer: string;
  nonce: number;
  accountNonce: number;
  chainId: number;
  chainName: string;
  assetName: string;
  hash: string;
  dest?: string;
  value?: string;
  decimals?: number;
}

export interface IUserPublic {
  login: string;
  apiKey: string;
  // accessKey: string;
}

export interface IUser extends IUserPublic, Document {
  passwordHash: string;
  salt: string;
  createdAt: string;
}
