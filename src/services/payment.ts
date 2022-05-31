import { ethers } from 'ethers';

import ERC20 from '../abi/erc20';
import { HOUR_MILLIS, MINUTE_MILLIS } from '../constants';
import { ETHERUM_URI, PAYMENT_ADDRESS } from '../env';
import { IPayment, IUser } from '../models/Models';
import Payment from '../models/PaymentSchema';
import User from '../models/UserSchema';
import { sleep } from '../utils';
import { createLogger } from './logger';

const DAY_ADDRESS = '0xe814aee960a85208c3db542c53e7d4a6c8d5f60f';
const CONFIRMATIONS = 2;

const logger = createLogger('payment');
const provider = new ethers.providers.JsonRpcProvider(ETHERUM_URI);
const dayContract = new ethers.Contract(DAY_ADDRESS, ERC20, provider);

const SYNC_MIN_BLOCK = 14855555;
const TX_STATUS_FAILED = 0;
const CREDITS_PER_DAY = 1;
const PAYMENT_TTL = 24 * HOUR_MILLIS;

let startBlock = SYNC_MIN_BLOCK;

async function init(): Promise<void> {
  await removeExpiredPayments();
  startBlock = await getLastSyncedBlockNumber();
  logger.info('Starting payment monitor...');
  await processPeriodically();
}

async function removeExpiredPayments() {
  logger.debug('Removing expired payments...');
  const cutoffDate = new Date(Date.now() - PAYMENT_TTL).toISOString();
  const res = await Payment.remove({ processed: false, createdAt: { $lte: cutoffDate } });
  logger.debug(`Removed ${res.deletedCount} expired payments`);
}

async function getLastSyncedBlockNumber(): Promise<number> {
  const [res] = await Payment.find({ processed: true }).sort({ blockNumber: 'desc' }).limit(1);

  return res?.blockNumber || SYNC_MIN_BLOCK;
}

async function processPeriodically(): Promise<void> {
  try {
    await Promise.all([processLogs(), sleep(MINUTE_MILLIS)]);
  } catch (e) {
    logger.error(e);
  }
  processPeriodically();
}

async function processLogs(): Promise<void> {
  const latestBlock = (await provider.getBlockNumber()) - 1;
  logger.debug(`🚀 processing payments for blocks ${startBlock} - ${latestBlock}...`);
  const events = await dayContract.queryFilter(
    dayContract.filters.Transfer(null, PAYMENT_ADDRESS),
    startBlock,
    latestBlock,
  );
  const sortedEvents = events.sort((a, b) => a.blockNumber - b.blockNumber);

  logger.debug(`ℹ found ${sortedEvents.length} events, processing...`);

  for (const event of sortedEvents) {
    await processPayment(event);
  }

  startBlock = Math.max(startBlock, latestBlock);

  logger.debug(`🎉 processing payments from logs completed`);
}

async function processPayment(event: ethers.Event): Promise<void> {
  try {
    const parsed = dayContract.interface.parseLog(event);
    const [from, _to, amountDay]: [string, string, ethers.BigNumber] = parsed.args as any;
    const txHash = event.transactionHash;
    const { user, payment } = await matchSenderToPaymentAndUser(from, event.transactionHash);
    await waitForConfirmations(txHash);

    const formattedAmount = Math.floor(Number(ethers.utils.formatEther(amountDay)));
    const credits = formattedAmount * CREDITS_PER_DAY;

    await markPaymentProcessed({
      paymentId: payment.id,
      amount: formattedAmount,
      credits,
      blockNumber: event.blockNumber,
      txHash,
    });
    await giveCreditsToUser(user.id, credits);

    logger.info(`✅ processed payment from ${from} for ${formattedAmount} DAY`);

    // TODO send email confirmation
  } catch (e) {
    logger.error(e);
  }
}

async function matchSenderToPaymentAndUser(from: string, txHash: string): Promise<{ user: IUser; payment: IPayment }> {
  const payment = await Payment.findOne({ from: from.toLowerCase(), processed: false });
  const duplicate = await Payment.findOne({ txHash });

  if (duplicate) {
    throw new Error(`Payment ${txHash} has already been processed`);
  }

  if (!payment) {
    throw new Error(`Payment ${txHash} from ${from} has no match in the database`);
  }

  const user = await User.findById(payment.userId);

  return { user, payment };
}

async function waitForConfirmations(txHash: string) {
  const { status } = await provider.waitForTransaction(txHash, CONFIRMATIONS);
  const success = status !== TX_STATUS_FAILED;

  if (!success) {
    throw new Error(`❌ tx ${txHash} failed. skipping`);
  }
}

async function markPaymentProcessed({
  paymentId,
  amount,
  credits,
  txHash,
  blockNumber,
}: {
  paymentId: string;
  amount: number;
  credits: number;
  txHash: string;
  blockNumber: number;
}): Promise<void> {
  await Payment.updateOne({ _id: paymentId }, { amount, credits, txHash, blockNumber, processed: true });
}

async function giveCreditsToUser(userId: string, credits: number) {
  await User.updateOne({ _id: userId }, { $inc: { credits } });
}

////////////////

async function getPaymentAddress() {
  return { address: PAYMENT_ADDRESS };
}

async function initializePayment(userId: string, from: string) {
  await Payment.create({ userId, from: from.toLowerCase() });
}

export default {
  init,
  getPaymentAddress,
  initializePayment,
};
