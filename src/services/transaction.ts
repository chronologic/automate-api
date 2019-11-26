import BigNumber from 'bignumber.js';
import * as cheerio from 'cheerio';
import * as InputDataDecoder from 'ethereum-input-data-decoder';
import { ethers } from 'ethers';
import * as moment from 'moment';
import fetch from 'node-fetch';

import {
  IExecuteStatus,
  IScheduled,
  ITransactionMetadata,
  Status
} from '../models/Models';
import logger from './logger';

const abi = ['function balanceOf(address) view returns (uint256)'];
const CONFIRMATIONS = 3;
const fallbackAssetName = '_';

let coinGeckoCoins: ICoinGeckoCoin[] = [];

interface IValidationResult {
  res: boolean;
  status?: IExecuteStatus;
}

interface ICoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
}

export interface ITransactionExecutor {
  execute(scheduled: IScheduled, blockNum: number): Promise<IExecuteStatus>;
  fetchTransactionMetadata(
    scheduled: IScheduled
  ): Promise<ITransactionMetadata>;
}
export class TransactionExecutor implements ITransactionExecutor {
  public static async getSenderNextNonce({ chainId, from }): Promise<number> {
    const network = ethers.utils.getNetwork(chainId);

    return ethers.getDefaultProvider(network).getTransactionCount(from);
  }

  private static queue: Set<string> = new Set<string>();

  public async execute(
    scheduled: IScheduled,
    blockNum: number
  ): Promise<IExecuteStatus> {
    const id = scheduled._id.toString();

    if (TransactionExecutor.queue.has(id)) {
      logger.info(`${id} Processing...`);
      return { status: Status.Pending };
    }

    TransactionExecutor.queue.add(id);
    try {
      return await this.executeTransaction(scheduled, blockNum);
    } finally {
      TransactionExecutor.queue.delete(id);
    }
  }

  public async fetchTransactionMetadata(
    transaction: IScheduled
  ): Promise<ITransactionMetadata> {
    const provider = ethers.getDefaultProvider(
      ethers.utils.getNetwork(transaction.chainId)
    );
    const parsedTx = ethers.utils.parseTransaction(
      transaction.signedTransaction
    );
    const method =
      parsedTx.value.toString() === '0'
        ? this.fetchTokenMetadata
        : this.fetchEthMetadata;

    const {
      assetName,
      assetAmount,
      assetValue,
      executedAt
    } = await method.call(this, transaction, parsedTx, provider);

    return {
      assetName,
      assetAmount,
      assetValue,
      executedAt
    };
  }

  private async executeTransaction(
    scheduled: IScheduled,
    blockNum: number
  ): Promise<IExecuteStatus> {
    const id = scheduled._id.toString();
    const provider = this.getProvider(scheduled.chainId);

    logger.info(`${id} Executing...`);

    const isWaitingForConfirmations = this.isWaitingForConfirmations(
      scheduled,
      blockNum
    );
    if (isWaitingForConfirmations.res) {
      return isWaitingForConfirmations.status!;
    }

    const hasCorrectNonce = await this.hasCorrectNonce(scheduled);
    if (!hasCorrectNonce.res) {
      return hasCorrectNonce.status!;
    }

    const transaction = ethers.utils.parseTransaction(
      scheduled.signedTransaction
    );

    const networkTransaction = await provider.getTransaction(transaction.hash!);
    if (networkTransaction && networkTransaction.hash) {
      logger.info(`${id} Already posted ${networkTransaction.hash}`);
      return this.pending;
    }

    const isConditionMet = await this.isConditionMet(
      scheduled,
      transaction,
      provider
    );
    if (!isConditionMet) {
      logger.info(`${id} Condition not met`);
      return this.pending;
    } else if (!scheduled.conditionBlock) {
      logger.info(`${id} Condition met. Waiting for confirmations.`);
      return this.pending;
    }

    try {
      const response = await provider.sendTransaction(
        scheduled.signedTransaction
      );
      logger.info(`${id} Sent ${response.hash}`);

      const receipt = await response.wait(CONFIRMATIONS);
      logger.info(`${id} Confirmed ${receipt.transactionHash}`);

      return {
        status: Status.Completed,
        transactionHash: receipt.transactionHash
      };
    } catch (e) {
      logger.error(`${id} ${e}`);
      return {
        status: Status.Error,
        transactionHash: e.transactionHash,
        error: e.toString()
      };
    }
  }

  private getProvider(chainId: number) {
    const network = ethers.utils.getNetwork(chainId);
    return ethers.getDefaultProvider(network);
  }

  private isWaitingForConfirmations(
    scheduled: IScheduled,
    blockNum: number
  ): IValidationResult {
    const isWaitingForConfirmations =
      scheduled.conditionBlock &&
      scheduled.conditionBlock + CONFIRMATIONS > blockNum;

    if (isWaitingForConfirmations) {
      logger.info(
        `${scheduled._id.toString()} Waiting for ${CONFIRMATIONS} confirmations. Condition met at ${
          scheduled.conditionBlock
        }, currently at ${blockNum} ${scheduled.nonce}`
      );
      return {
        res: true,
        status: this.pending
      };
    }

    return { res: false };
  }

  private async hasCorrectNonce(
    scheduled: IScheduled
  ): Promise<IValidationResult> {
    const senderNonce = await TransactionExecutor.getSenderNextNonce(scheduled);

    logger.info(
      `${scheduled._id} Sender nonce ${senderNonce} transaction nonce ${scheduled.nonce}`
    );

    if (senderNonce > scheduled.nonce) {
      logger.info(`${scheduled._id} Transaction nonce already spent`);
      return { res: false, status: { status: Status.StaleNonce } };
    }

    if (senderNonce !== scheduled.nonce) {
      logger.info(`${scheduled._id} Nonce does not match`);
      return { res: false, status: this.pending };
    }

    return { res: true };
  }

  private get pending() {
    return { status: Status.Pending };
  }

  private async isConditionMet(
    scheduled: IScheduled,
    transaction: ethers.utils.Transaction,
    provider: ethers.providers.BaseProvider
  ) {
    logger.info(
      `${scheduled._id} Condition: asset=${scheduled.conditionAsset} amount=${scheduled.conditionAmount}`
    );

    let currentConditionAmount;

    try {
      const token = new ethers.Contract(transaction.to, abi, provider);
      currentConditionAmount = (await token.balanceOf(
        transaction.from
      )) as BigNumber;
    } catch (e) {
      currentConditionAmount = await provider.getBalance(transaction.from!);
    }

    const condition = new BigNumber(scheduled.conditionAmount);
    const isStateConditionMet = currentConditionAmount.gte(condition);

    logger.info(
      `${
        scheduled._id
      } Condition=${condition.toString()} Current=${currentConditionAmount.toString()}`
    );

    const currentTime = new Date().getTime();
    const timeCondition = scheduled.timeCondition || 0;
    const isTimeConditionMet = currentTime > timeCondition;

    logger.info(
      `${scheduled._id} Time condition=${new Date(
        timeCondition
      ).toISOString()} Current=${new Date(currentTime).toISOString()}`
    );

    return isStateConditionMet && isTimeConditionMet;
  }

  private async fetchTokenMetadata(
    transaction: IScheduled,
    parsedTx: ethers.utils.Transaction,
    provider: ethers.providers.BaseProvider
  ): Promise<IScheduled> {
    if (!transaction.assetName) {
      logger.debug(`fetchTokenMetadata fetching assetName...`);
      transaction.assetName = await this.fetchTokenName(parsedTx.to);
      logger.debug(
        `fetchTokenMetadata fetched assetName: ${transaction.assetName}`
      );
    }

    if (transaction.assetAmount == null) {
      logger.debug(`fetchTokenMetadata fetching assetAmount...`);
      transaction.assetAmount = await this.fetchTokenAmount(
        parsedTx.to,
        parsedTx.data,
        provider
      );
      logger.debug(
        `fetchTokenMetadata fetched assetAmount: ${transaction.assetAmount}`
      );
    }

    if (!transaction.executedAt && transaction.transactionHash) {
      logger.debug(`fetchTokenMetadata fetching executedAt...`);
      transaction.executedAt = await this.fetchExecutedAt(
        transaction.transactionHash,
        provider
      );
      logger.debug(
        `fetchTokenMetadata fetched executedAt: ${transaction.executedAt}`
      );
    }

    if (
      transaction.assetValue == null ||
      transaction.status === Status.Completed
    ) {
      logger.debug(`fetchTokenMetadata fetching assetValue...`);
      const price = await this.fetchAssetPrice(
        transaction.assetName,
        transaction.executedAt
      );

      transaction.assetValue = transaction.assetAmount * price;
      logger.debug(
        `fetchTokenMetadata fetched assetValue: ${transaction.assetValue}`
      );
    }

    if (
      (transaction.assetName === fallbackAssetName ||
        transaction.assetValue === 0) &&
      transaction.transactionHash
    ) {
      logger.debug('fetchTokenMetadata scraping data as fallback...');
      const {
        assetName,
        assetAmount,
        assetValue
      } = await this.scrapeTokenMetadata(transaction.transactionHash);

      transaction.assetName = assetName || transaction.assetName;
      transaction.assetAmount = assetAmount || transaction.assetAmount;
      transaction.assetValue = assetValue || transaction.assetValue;
    }

    return transaction;
  }

  private async scrapeTokenMetadata(txHash) {
    try {
      const res = await fetch(
        `https://etherscan.io/tx/${txHash}`
      ).then(response => response.text());
      const $ = cheerio.load(res);
      const tokenDetails = $('.row .list-unstyled');
      const values = [0, 0];
      tokenDetails.find('.media-body').each((_, mb) => {
        const rowValues = $(mb)
          .find('> span.mr-1')
          .last()
          .text()
          .trim()
          .split(' ')
          .map(val => Number(val.trim().replace(/[\(\)\$,]/g, '')));
        values[0] = values[0] + rowValues[0];
        values[1] = values[1] + rowValues[1];
      });
      const [assetAmount, assetValue] = values;
      const assetName = tokenDetails
        .find('.media-body > a')
        .first()
        .text()
        .trim()
        .split(' ')
        .reverse()[0]
        .replace(/[\(\)]/g, '')
        .toLowerCase();

      return {
        assetAmount,
        assetValue,
        assetName
      };
    } catch (e) {
      logger.error(e);
      return {};
    }
  }

  private async fetchEthMetadata(
    transaction: IScheduled,
    parsedTx: ethers.utils.Transaction,
    provider: ethers.providers.BaseProvider
  ): Promise<IScheduled> {
    if (!transaction.assetName) {
      transaction.assetName = 'eth';
    }

    if (transaction.assetAmount == null) {
      logger.debug(`fetchEthMetadata calculating assetAmount...`);
      transaction.assetAmount = Number(
        ethers.utils.formatEther(parsedTx.value)
      );
      logger.debug(
        `fetchEthMetadata calculated assetAmount: ${transaction.assetAmount}`
      );
    }

    if (!transaction.executedAt && transaction.transactionHash) {
      logger.debug(`fetchEthMetadata fetching executedAt...`);
      transaction.executedAt = await this.fetchExecutedAt(
        transaction.transactionHash,
        provider
      );
      logger.debug(
        `fetchEthMetadata fetched executedAt: ${transaction.executedAt}`
      );
    }

    if (
      transaction.assetValue == null ||
      transaction.status === Status.Completed
    ) {
      logger.debug(`fetchEthMetadata fetching assetValue...`);
      const price = await this.fetchAssetPrice('eth', transaction.executedAt);

      transaction.assetValue = transaction.assetAmount * price;
      logger.debug(
        `fetchEthMetadata fetched assetValue: ${transaction.assetValue}`
      );
    }

    return transaction;
  }

  private async fetchExecutedAt(
    txHash: string,
    provider: ethers.providers.BaseProvider
  ): Promise<string> {
    try {
      const tx = await provider.getTransaction(txHash);
      const block = await provider.getBlock(tx.blockHash);
      return new Date(block.timestamp * 1000).toISOString();
    } catch (e) {
      logger.error(e);
      return moment('2000-01-01').toISOString();
    }
  }

  private async fetchAssetPrice(
    symbol: string,
    timestamp: string
  ): Promise<number> {
    try {
      logger.debug(`fetchAssetPrice fetching assetId...`);
      const assetId = await this.fetchCoinGeckoAssetId(symbol);
      logger.debug(`fetchAssetPrice fetched assetId: ${assetId}`);
      const dateParam = moment(timestamp).format('DD-MM-YYYY');
      logger.debug(`fetchAssetPrice dateParam from ${timestamp}: ${dateParam}`);
      let res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${assetId}/history?date=${dateParam}`
      ).then(response => response.json());

      try {
        return res.market_data.current_price.usd;
      } catch (e) {
        logger.debug(
          `fetchAssetPrice historical data not available, trying current data...`
        );
        res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`
        ).then(response => response.json());
        return res[assetId].usd;
      }
    } catch (e) {
      logger.error(e);
      return 0;
    }
  }

  private async fetchCoinGeckoAssetId(symbol): Promise<string> {
    const fallbackAssetId = '_';
    let asset = coinGeckoCoins.find(coin => coin.symbol === symbol);

    if (asset) {
      return asset.id;
    }

    try {
      coinGeckoCoins = await fetch(
        'https://api.coingecko.com/api/v3/coins/list'
      ).then(response => response.json());
      asset = coinGeckoCoins.find(coin => coin.symbol === symbol);

      return asset.id || fallbackAssetId;
    } catch (e) {
      logger.error(e);
      return fallbackAssetId;
    }
  }

  private async fetchTokenAmount(
    contractAddress: string,
    txData: string,
    provider: ethers.providers.BaseProvider
  ): Promise<number> {
    try {
      const tokenAbi = await this.fetchABI(contractAddress);
      const decoder = new InputDataDecoder(tokenAbi);
      const decoded = decoder.decodeData(txData);
      const token = new ethers.Contract(contractAddress, tokenAbi, provider);
      const decimals = await token.functions.decimals();
      if (decoded.method === 'transfer') {
        const amount = new BigNumber(decoded.inputs[1].toString(10));

        return amount.div(new BigNumber(10).pow(decimals)).toNumber();
      } else if (decoded.method === 'transferFrom') {
        const amount = new BigNumber(decoded.inputs[2].toString(10));

        return amount.div(new BigNumber(10).pow(decimals)).toNumber();
      } else {
        logger.debug(
          `fetchTokenAmount unsupported decoded method: ${decoded.method}`
        );
        return 0;
      }
    } catch (e) {
      logger.error(e);
      return 0;
    }
  }

  private async fetchABI(contractAddress: string): Promise<any> {
    try {
      const res = await fetch(
        `https://api.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`
      ).then(response => response.json());

      return JSON.parse(res.result);
    } catch (e) {
      logger.error(e);
      return [{}];
    }
  }

  private async fetchTokenName(contractAddress: string): Promise<string> {
    const fallbackName = '_';
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/ethereum/contract/${contractAddress}`
      ).then(response => response.json());

      return res.symbol || fallbackName;
    } catch (e) {
      logger.error(e);
      return fallbackName;
    }
  }
}
