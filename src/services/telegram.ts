import TelegramBot from 'node-telegram-bot-api';
import random from 'lodash/random';

import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../env';
import logger from '../logger';

interface ITelegramMessenger {
  sendMessage(msg: string): void;
  scheduled({ value, savings }: { value?: number; savings?: number }): void;
  executed({ value, savings }: { value?: number; savings?: number }): void;
}

const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
  // polling: true,
  polling: false,
});
// uncomment and run this to find out the ID of a chat - you can send a message like "ohai @<bot_name>"
// make sure to set polling=true in TelegramBot constructor
// telegramBot.on("message", (msg) => {
//   const chatId = msg.chat.id;
//   telegramBot.sendMessage(chatId, "The ID of this chat is: " + chatId);
// });
// or check ID in Plus Messenger

function createMessenger(chatId: string): ITelegramMessenger {
  return {
    sendMessage(msg: string): void {
      return sendMessage(chatId, msg);
    },
    scheduled({ value, savings }): void {
      let msg = '🕒 A transaction ';
      if (value) {
        msg += `worth ${formatCurrency(randomizeValue(value))} `;
      }
      msg += 'was just scheduled through Automate';
      if (savings) {
        msg += `, saving the user ${formatCurrency(randomizeValue(savings))} in gas fees`;
      }
      msg += '!';
      sendMessage(chatId, msg);
    },
    executed({ value, savings }): void {
      let msg = '🚀 A transaction ';
      if (value) {
        msg += `worth ${formatCurrency(randomizeValue(value))} `;
      }
      msg += 'was just executed through Automate';
      if (savings) {
        msg += `, saving the user ${formatCurrency(randomizeValue(savings))} in gas fees`;
      }
      msg += '!';
      sendMessage(chatId, msg);
    },
  };
}

function sendMessage(chatId: string, msg: string): void {
  logger.info(`Sending msg "${msg}" to ${chatId}...`);
  chatId && telegramBot.sendMessage(chatId, msg);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function randomizeValue(value: number, percentFrom = -3, percentTo = 5) {
  const lower = (value * (100 + percentFrom)) / 100;
  const upper = (value * (100 + percentTo)) / 100;

  return random(lower, upper, true);
}

export default createMessenger(TELEGRAM_CHAT_ID);
