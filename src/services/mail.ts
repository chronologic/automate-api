// tslint:disable: no-object-literal-type-assertion
import * as client from '@sendgrid/mail';
import BigNumber from 'bignumber.js';

import { IScheduled } from '../models/Models';
import logger from './logger';

const API_KEY = process.env.SENDGRID_API_KEY;
const SUCCESS_EMAILS = process.env.SUCCESS_EMAILS === 'true';
const FAILURE_EMAILS = process.env.FAILURE_EMAILS === 'true';
const DELAYED_EMAILS = process.env.DELAYED_EMAILS === 'true';
const EXTERNAL_RECIPIENTS = process.env.EXTERNAL_RECIPIENTS === 'true';

const RECIPIENTS = process.env.EMAIL_RECIPIENTS.split(';');

const successTemplateId = 'd-2f91d8bbb6494ae7a869b0c94f6079c9';
const failureTemplateId = 'd-2ab9ac45ca864550bd69900bccd0a8ee';
const delayedGasPriceTemplateId = 'd-1e832369e2cc42489011610c8bf191d2';

client.setApiKey(API_KEY);

interface IMailParams extends Partial<IScheduled> {
  networkGasPrice?: BigNumber;
  txGasPrice?: BigNumber;
}

type MailStatus = 'success' | 'failure' | 'delayed_gasPrice';

const templateIds = {
  success: successTemplateId,
  failure: failureTemplateId,
  delayed_gasPrice: delayedGasPriceTemplateId,
};

const mailSubjects = {
  success: '[AUTOMATE] ✅ SUCCESS',
  failure: '[AUTOMATE] ❌ ERROR',
  delayed_gasPrice: '[AUTOMATE] ⏳ DELAYED due to gas price',
};

async function send(
  scheduledTx: IMailParams,
  status: MailStatus,
): Promise<void> {
  if (status === 'success' && !SUCCESS_EMAILS) {
    return;
  } else if (status === 'failure' && !FAILURE_EMAILS) {
    return;
  } else if (status === 'delayed_gasPrice' && !DELAYED_EMAILS) {
    return;
  }

  const recipients = [...RECIPIENTS];
  if (EXTERNAL_RECIPIENTS && scheduledTx.paymentEmail) {
    recipients.push(scheduledTx.paymentEmail);
  }
  logger.info(
    `Sending ${status.toUpperCase()} email for tx ${scheduledTx.id} ${
      scheduledTx.transactionHash
    } to ${JSON.stringify(recipients)}`,
  );
  await client.send({
    to: recipients,
    subject: mailSubjects[status],
    from: 'team@chronologic.network',
    templateId: templateIds[status],
    dynamicTemplateData: {
      id: scheduledTx._id,
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
      error: scheduledTx.error,
      networkGasPrice: (scheduledTx.networkGasPrice || '0').toString(0),
      txGasPrice: (scheduledTx.txGasPrice || '0').toString(),
    },
  });
}

export default send;
