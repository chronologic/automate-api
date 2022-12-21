// tslint:disable: no-object-literal-type-assertion
import client from '@sendgrid/mail';
import BigNumber from 'bignumber.js';

import { IScheduled } from '../models/Models';
import logger from './logger';
import { ChainId, BlockExplorerUrl } from '../constants';

const API_KEY = process.env.SENDGRID_API_KEY;
const SUCCESS_EMAILS = process.env.SUCCESS_EMAILS === 'true';
const FAILURE_EMAILS = process.env.FAILURE_EMAILS === 'true';
const DELAYED_EMAILS = process.env.DELAYED_EMAILS === 'true';
const EXTERNAL_RECIPIENTS = process.env.EXTERNAL_RECIPIENTS === 'true';

const RECIPIENTS = (process.env.EMAIL_RECIPIENTS || '').split(';');

const scheduledTemplateId = 'd-31682cf5bd904f7ca0ed0fdfe4405451';
const cancelledTemplateId = 'd-2297e2d4f3de48e487c885601642603e';
const successTemplateId = 'd-2f91d8bbb6494ae7a869b0c94f6079c9';
const failureTemplateId = 'd-2ab9ac45ca864550bd69900bccd0a8ee';
const delayedGasPriceTemplateId = 'd-1e832369e2cc42489011610c8bf191d2';
const passwordResetTemplateId = 'd-061cd0a77d2b4fb282318b7c187f3ab6';

client.setApiKey(API_KEY);

interface IMailParams extends Partial<IScheduled> {
  networkGasPrice?: BigNumber;
  txGasPrice?: BigNumber;
}

type MailStatus = 'scheduled' | 'cancelled' | 'success' | 'failure' | 'delayed_gasPrice';

const templateIds = {
  scheduled: scheduledTemplateId,
  cancelled: cancelledTemplateId,
  success: successTemplateId,
  failure: failureTemplateId,
  delayed_gasPrice: delayedGasPriceTemplateId,
};

const mailSubjects = {
  scheduled: '[AUTOMATE] 🕒 Scheduled',
  cancelled: '[AUTOMATE] 🗳 Cancelled',
  success: '[AUTOMATE] ✅ Executed',
  failure: '[AUTOMATE] ❌ Error',
  delayed_gasPrice: '[AUTOMATE] ⏳ Delayed due to gas price',
};

async function send(scheduledTx: IMailParams, status: MailStatus): Promise<void> {
  if (!mailSubjects[status]) {
    throw new Error(`Unsupported mail status: ${status}`);
  }
  const amount = (scheduledTx.assetAmount || 0).toFixed(2);
  const name = scheduledTx.assetName || '';
  const from = scheduledTx.from;
  const subject = `${mailSubjects[status]} ${amount} ${name} from ${from}`;
  const networkName: string = ChainId[scheduledTx.chainId];

  const txUrl: string =
    BlockExplorerUrl[networkName as keyof typeof BlockExplorerUrl] + 'tx/' + scheduledTx.transactionHash;
  const fromUrl: string =
    BlockExplorerUrl[networkName as keyof typeof BlockExplorerUrl] + 'address/' + scheduledTx.from;
  let conditionAssetUrl = '';
  if (scheduledTx.conditionAsset) {
    conditionAssetUrl =
      BlockExplorerUrl[networkName as keyof typeof BlockExplorerUrl] + 'address/' + scheduledTx.conditionAsset;
  }

  try {
    logger.info(
      `Sending ${status.toUpperCase()} email for tx ${scheduledTx._id} ${
        scheduledTx.transactionHash
      } to ADMIN(S) ${JSON.stringify(RECIPIENTS)}`,
    );
    await client.send({
      to: RECIPIENTS,
      subject,
      from: 'team@chronologic.network',
      templateId: templateIds[status],
      dynamicTemplateData: {
        id: scheduledTx._id,
        amount,
        value: (scheduledTx.assetValue || 0).toFixed(2),
        name,
        type: scheduledTx.assetType || '',
        chainId: scheduledTx.chainId,
        txHash: scheduledTx.transactionHash,
        txHashLink: txUrl,
        nonce: scheduledTx.nonce,
        from: scheduledTx.from,
        fromLink: fromUrl,
        conditionBlock: scheduledTx.conditionBlock,
        conditionAmount: scheduledTx.conditionAmount,
        conditionAsset: scheduledTx.conditionAsset,
        conditionAssetLink: conditionAssetUrl,
        timeCondition: scheduledTx.timeCondition,
        timeConditionTZ: scheduledTx.timeConditionTZ,
        createdAt: scheduledTx.createdAt,
        paymentEmail: scheduledTx.paymentEmail,
        paymentAddress: scheduledTx.paymentAddress,
        paymentRefundAddress: scheduledTx.paymentRefundAddress,
        error: scheduledTx.error,
        networkGasPrice: (scheduledTx.networkGasPrice || '0').toString(),
        txGasPrice: (scheduledTx.txGasPrice || '0').toString(),
        gasPaid: scheduledTx.gasPaid,
        gasSaved: scheduledTx.gasSaved,
      },
    });
    if (EXTERNAL_RECIPIENTS && scheduledTx.paymentEmail) {
      logger.info(
        `Sending ${status.toUpperCase()} email for tx ${scheduledTx._id} ${
          scheduledTx.transactionHash
        } to ${JSON.stringify(scheduledTx.paymentEmail)}`,
      );
      await client.send({
        to: scheduledTx.paymentEmail,
        subject,
        from: 'team@chronologic.network',
        templateId: templateIds[status],
        dynamicTemplateData: {
          id: scheduledTx._id,
          amount,
          value: (scheduledTx.assetValue || 0).toFixed(2),
          name,
          type: scheduledTx.assetType || '',
          chainId: scheduledTx.chainId,
          txHash: scheduledTx.transactionHash,
          txHashLink: txUrl,
          nonce: scheduledTx.nonce,
          from: scheduledTx.from,
          fromLink: fromUrl,
          conditionBlock: scheduledTx.conditionBlock,
          conditionAmount: scheduledTx.conditionAmount,
          conditionAsset: scheduledTx.conditionAsset,
          conditionAssetLink: conditionAssetUrl,
          timeCondition: scheduledTx.timeCondition,
          timeConditionTZ: scheduledTx.timeConditionTZ,
          createdAt: scheduledTx.createdAt,
          paymentEmail: scheduledTx.paymentEmail,
          paymentAddress: scheduledTx.paymentAddress,
          paymentRefundAddress: scheduledTx.paymentRefundAddress,
          error: scheduledTx.error,
          networkGasPrice: (scheduledTx.networkGasPrice || '0').toString(),
          txGasPrice: (scheduledTx.txGasPrice || '0').toString(),
          gasPaid: scheduledTx.gasPaid,
          gasSaved: scheduledTx.gasSaved,
        },
      });
    }
  } catch (e) {
    logger.error(e);
  }
}

export async function sendResetPasswordEmail(resetPasswordEmail: string, resetLink: string): Promise<void> {
  try {
    await client.send({
      to: resetPasswordEmail,
      subject: '[AUTOMATE] 🔃 Reset your password in Automate',
      from: 'team@chronologic.network',
      templateId: passwordResetTemplateId,
      dynamicTemplateData: {
        passwordResetUrl: resetLink,
      },
    });
  } catch (e) {
    logger.error(e);
  }
}

export default send;
