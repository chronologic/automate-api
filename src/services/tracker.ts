import { ethers } from 'ethers';
import * as KeenTracking from 'keen-tracking';

import { IScheduled } from '../models/Models';

export interface ITracker {
  trackQueue(pending: number);
  trackTransaction(scheduled: IScheduled);
}

export class Tracker implements ITracker {
  private client: any;

  constructor() {
    this.client = new KeenTracking({
      projectId: process.env.KEEN_PROJECT,
      writeKey: process.env.KEEN_WRITE_KEY
    });
  }

  public trackQueue(pending: number) {
    this.client.recordEvent('pending', {
      pending
    });
  }

  public trackTransaction(scheduled: IScheduled) {
    const decodedTransaction = ethers.utils.parseTransaction(
      scheduled.signedTransaction
    );

    this.client.recordEvent('transaction', {
      conditionAsset: scheduled.conditionAsset,
      conditionAmount: scheduled.conditionAmount,
      status: scheduled.status,
      from: scheduled.from,
      chainId: scheduled.chainId,
      timeCondition: scheduled.timeCondition,
      tokenTransfer:
        decodedTransaction.data !== '' &&
        decodedTransaction.data.startsWith('0xa9059cbb')
    });
  }
}
