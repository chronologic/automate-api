import { ethers } from 'ethers';

import ERC20 from '../abi/erc20';
import { IScheduled, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';
import { makeLogger } from './logger';

const PAYMENT_ADDRESSES = (process.env.PAYMENT_ADDRESSES || '').split(',');
const DAY_ADDRESS = '0xe814aee960a85208c3db542c53e7d4a6c8d5f60f';
const MINUTE_MILLIS = 60 * 1000;
const MAX_PAYMENT_LIFETIME = 60 * MINUTE_MILLIS;
const CONFIRMATIONS = 3;
const SCHEDULE_PRICE = ethers.BigNumber.from('10 000 000 000 000 000 000'.replace(/ /g, ''));

const logger = makeLogger('payment');
const tokenInterface = new ethers.utils.Interface(ERC20);
const transferTopic = tokenInterface.getEventTopic('Transfer');

export class PaymentService {
  // TODO: check existing pending payments and use them as a last resort
  // This is helpful when restarting server
  public static getNextPaymentAddress() {
    PaymentService.currentAddressIndex =
      PaymentService.currentAddressIndex >= PAYMENT_ADDRESSES.length ? 0 : PaymentService.currentAddressIndex++;

    return PAYMENT_ADDRESSES[PaymentService.currentAddressIndex];
  }

  public static init(): void {
    logger.info('Initializing payment processor');
    const filter = {
      address: DAY_ADDRESS,
      topics: [transferTopic],
    };

    const provider = ethers.getDefaultProvider();

    provider.on(filter, (event: any) => PaymentService.processPayment(event));

    PaymentService.startExpirationWatcher();
  }

  private static currentAddressIndex = 0;

  private static async processPayment(event: any): Promise<void> {
    const log = tokenInterface.parseLog(event);
    // TODO: fixme
    const values = log.args.values() as any;
    const from = values.from;
    const to = values.to;
    const amount = values.value.toString();

    if (PAYMENT_ADDRESSES.find((addr) => addr.toLowerCase() === to.toLowerCase())) {
      logger.info(`Payment from ${from} to ${to} for ${amount} detected. Tx ${event.transactionHash}`);

      const pending = await this.getPendingPayments();
      const tx = pending.find((item) => item.paymentAddress.toLowerCase() === to.toLowerCase());

      if (tx) {
        logger.info(`[${tx._id}] Payment matched`);
        if (SCHEDULE_PRICE.lte(amount)) {
          logger.info(`[${tx._id}] Awaiting confirmations`);
          tx.status = Status.PendingPaymentConfirmations;
          tx.paymentTx = event.transactionHash;
          await tx.save();
          await PaymentService.waitForConfirmation(event.transactionHash);
          logger.info(`[${tx._id}] Payment confirmed`);
          tx.status = Status.Pending;
          await tx.save();
        } else {
          logger.info(`[${tx._id}] Payment amount insufficient: ${amount}`);
        }
      } else {
        logger.info('Payment not matched. Thank you for your donation!');
      }
    }
  }

  private static async startExpirationWatcher(): Promise<void> {
    setInterval(async () => {
      const pending = await this.getPendingPayments();
      const now = new Date().getTime();
      pending.forEach((tx) => {
        if (now - new Date(tx.createdAt).getTime() > MAX_PAYMENT_LIFETIME) {
          tx.status = Status.PaymentExpired;
          tx.save();
        }
      });
    }, MINUTE_MILLIS);
  }

  private static async waitForConfirmation(txHash: string): Promise<ethers.providers.TransactionReceipt> {
    const provider = ethers.getDefaultProvider();
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
      logger.error('Transaction %s not found', txHash);
      throw new Error();
    }

    return provider.waitForTransaction(txHash, CONFIRMATIONS);
  }

  private static async getPendingPayments(): Promise<IScheduled[]> {
    return Scheduled.where('status', Status.PendingPayment).sort('createdAt').exec();
  }
}
