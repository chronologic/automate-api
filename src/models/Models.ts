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
  signedTransaction: string;
  timeCondition: number;
  timeConditionTZ: string;
  paymentEmail: string;
  paymentRefundAddress: string;
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
  accountNonce: number;
  chainId: number;
  chainName: string;
  assetName: string;
  hash: string;
  dest?: string;
  value?: string;
  decimals?: number;
}
