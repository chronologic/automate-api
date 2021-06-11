import * as TelegramBot from 'node-telegram-bot-api';
console.log('TG', TelegramBot);

import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../env';

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
        msg += `worth ${formatCurrency(value)} `;
      }
      msg += 'was just scheduled through Automate';
      if (savings) {
        msg += `, saving the user ${formatCurrency(savings)} in gas fees`;
      }
      msg += '!';
      sendMessage(chatId, msg);
    },
    executed({ value, savings }): void {
      let msg = '🚀 A transaction ';
      if (value) {
        msg += `worth ${formatCurrency(value)} `;
      }
      msg += 'was just executed through Automate';
      if (savings) {
        msg += `, saving the user ${formatCurrency(savings)} in gas fees`;
      }
      msg += '!';
      sendMessage(chatId, msg);
    },
  };
}

function sendMessage(chatId: string, msg: string): void {
  chatId && telegramBot.sendMessage(chatId, msg);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default createMessenger(TELEGRAM_CHAT_ID);
