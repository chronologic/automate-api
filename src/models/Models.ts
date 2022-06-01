import { ApiPromise } from '@polkadot/api';
import { Document } from 'mongoose';
import { Request } from 'express';
import { ethers } from 'ethers';

import { ChainId } from '../constants';

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
  getBalance(address: string): Promise<ethers.BigNumber>;
  txToExtrinsic(tx: string): Promise<any>;
  parseTx(tx: string): Promise<IPolkadotTx>;
  fetchTransactionMetadata(transaction: IScheduled): Promise<ITransactionMetadata>;
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
  method: string;
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
  assetAmountWei: string;
  assetDecimals: number;
  assetValue: number;
  assetContract: string;
  createdAt: string;
  updatedAt: string;
  executedAt: string;
  paymentEmail: string;
  paymentRefundAddress: string;
  paymentAddress: string;
  paymentTx: string;
  priority?: number;
  userId?: string;
  strategyInstanceId?: string;
  strategyPrepId?: string;
  notes?: string;
  scheduledEthPrice?: number;
  scheduledGasPrice?: number;
  executedEthPrice?: number;
  executedGasPrice?: number;
  gasPaid?: number;
  gasSaved?: number;
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
  fromLabel: string;
  to: string;
  toLabel: string;
  method: string;
  methodLabel: string;
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
  assetDecimals: number;
  assetValue: number;
  assetContract: string;
  createdAt: string;
  executedAt: string;
  txKey: string;
  notes: string;
  gasPaid: number;
  gasSaved: number;
}

export interface IExecuteStatus {
  status: Status;
  broadcasted?: boolean;
  conditionMet?: boolean;
  transactionHash?: string;
  error?: string;
  executedAt?: string;
  assetName?: string;
  assetAmount?: number;
  assetValue?: number;
  executionAttempts?: number;
  lastExecutionAttempt?: string;
  conditionBlock?: number;
}

export interface IScheduleRequest {
  assetType: AssetType;
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
  source?: 'proxy';
}

export interface ITransactionMetadata extends IGasStats {
  assetName: string;
  assetAmount: number;
  assetAmountWei: string;
  assetDecimals: number;
  assetValue: number;
  assetContract: string;
  executedAt: string;
}

export interface IGasStats {
  ethPrice?: number;
  txGasPrice?: string;
  networkGasPrice?: number;
  gasPaid?: number;
  gasSaved?: number;
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
  source: string;
  // accessKey: string;
}

export interface IUser extends IUserPublic, Document {
  passwordHash: string;
  salt: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestWithAuth extends Request {
  user: IUser;
}

export interface IPlatform extends Document {
  name: string;
  credits: number;
  // assetType -> chainId -> address[]
  whitelist: Map<string, Map<string, string[]>>;
  webhook: string;
  createdAt: string;
  executedAt: string;
}

export interface IUserCredits {
  user: number;
  community: number;
}

export interface IUserResetPassword {
  login: string;
  link: string;
}

export interface IStrategyPrepTx {
  assetType: AssetType;
  chainId: number;
  from: string;
  to: string;
  data: string;
}

export interface IStrategyPrepTxWithConditions extends IStrategyPrepTx {
  order: number;
  isLastForNonce?: boolean;
  priority: number;
  conditionAsset?: string;
  conditionAmount?: string;
  timeCondition?: number;
  timeConditionTZ?: string;
}

export interface IStrategyPrep extends IStrategyPrepTxWithConditions, Document {
  instanceId: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface IStrategyPrepResponse {
  instanceId: string;
  expiresAt: string;
}

export type TxLabelType = 'address' | 'method';

export interface ITxLabel extends Document {
  assetType: AssetType;
  chainId: ChainId;
  type: TxLabelType;
  hash: string;
  label: string;
  createdAt: string;
  executedAt: string;
}

export interface IPayment extends Document {
  userId: string;
  processed?: boolean;
  from: string;
  txHash?: string;
  blockNumber?: number;
  amount?: number;
  credits?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IGasPrice extends Document {
  assetType: AssetType;
  chainId: ChainId;
  price: number;
  createdAt?: string;
}
