import fetch from 'node-fetch';

import { IScheduled, Status } from '../models/Models';
import platformService from './platform';

interface IWebhookNotification {
  event: string;
  email: string;
  txHash: string;
  gasPaidUsd: number;
  gasSavedUsd: number;
}

const statusNames: {
  [key: number]: string;
} = {
  [Status.Pending]: 'scheduled',
  [Status.Completed]: 'executed',
};

async function notify(scheduled: IScheduled): Promise<void> {
  if (!Object.keys(statusNames).includes(scheduled.status as any)) {
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

    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(notification),
    });
  }
}

export default {
  notify,
};
