import * as client from '@sendgrid/mail';

import { IScheduled } from '../models/Models';
import logger from './logger';

const API_KEY = process.env.SENDGRID_API_KEY;
const SUCCESS_EMAILS = process.env.SUCCESS_EMAILS === 'true';
const FAILURE_EMAILS = process.env.FAILURE_EMAILS === 'true';
const EXTERNAL_RECIPIENTS = process.env.EXTERNAL_RECIPIENTS === 'true';

const RECIPIENTS = process.env.EMAIL_RECIPIENTS.split(';');

const successTemplateId = 'd-2f91d8bbb6494ae7a869b0c94f6079c9';
const failureTemplateId = 'd-2ab9ac45ca864550bd69900bccd0a8ee';

client.setApiKey(API_KEY);

async function send(scheduledTx: IScheduled): Promise<void> {
  const success = !scheduledTx.error;
  if (success && !SUCCESS_EMAILS) {
    return;
  }
  if (!success && !FAILURE_EMAILS) {
    return;
  }

  const recipients = [...RECIPIENTS];
  if (EXTERNAL_RECIPIENTS && scheduledTx.paymentEmail) {
    recipients.push(scheduledTx.paymentEmail);
  }
  logger.info(
    `Sending ${success ? 'SUCCESS' : 'ERROR'} email for tx ${scheduledTx.id} ${
      scheduledTx.transactionHash
    } to ${JSON.stringify(recipients)}`,
  );
  await client.send({
    to: recipients,
    subject: success ? '[AUTOMATE] SUCCESS' : '[AUTOMATE] ERROR',
    from: 'team@chronologic.network',
    templateId: success ? successTemplateId : failureTemplateId,
    dynamicTemplateData: {
      id: scheduledTx.id,
      amount: (scheduledTx.assetAmount || 0).toFixed(2),
      value: (scheduledTx.assetValue || 0).toFixed(2),
      name: scheduledTx.assetName || '',
      type: scheduledTx.assetType || '',
      chainId: scheduledTx.chainId,
      txHash: scheduledTx.transactionHash,
      nonce: scheduledTx.nonce,
      from: scheduledTx.from,
      conditionBlock: scheduledTx.conditionBlock,
      conditionAmount: scheduledTx.conditionAmount,
      conditionAsset: scheduledTx.conditionAsset,
      timeCondition: scheduledTx.timeCondition,
      timeConditionTZ: scheduledTx.timeConditionTZ,
      createdAt: scheduledTx.createdAt,
      paymentEmail: scheduledTx.paymentEmail,
      paymentAddress: scheduledTx.paymentAddress,
      paymentRefundAddress: scheduledTx.paymentRefundAddress,
    },
  });
}

export default send;
