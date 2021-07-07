import fetch from 'node-fetch';

import { IScheduled, Status } from '../models/Models';
import { createLogger } from '../logger';
import platformService from './platform';

interface IWebhookNotification {
  event: string;
  email: string;
  txHash: string;
  gasPaidUsd: number;
  gasSavedUsd: number;
}

const logger = createLogger('webhook');

const statusNames: {
  [key: number]: string;
} = {
  [Status.Pending]: 'scheduled',
  [Status.Completed]: 'executed',
};

const statusCodes = Object.keys(statusNames).map(Number);

async function notify(scheduled: IScheduled): Promise<void> {
  if (!statusCodes.includes(scheduled.status as any)) {
    logger.info(`${scheduled._id} is not in supported status: ${scheduled.status}, skipping`);
    return;
  }

  const url = await platformService.matchTxToWebhook(scheduled.signedTransaction);

  if (url) {
    const notification: IWebhookNotification = {
      event: statusNames[scheduled.status],
      email: scheduled.paymentEmail,
      txHash: scheduled.transactionHash,
      gasPaidUsd: scheduled.gasPaid,
      gasSavedUsd: scheduled.gasSaved,
    };
    logger.info(`Notifying ${url} about ${JSON.stringify(notification)}...`);

    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(notification),
    });
  } else {
    logger.info('No match found');
  }
}

export default {
  notify,
};
