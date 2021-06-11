import { config } from 'dotenv';

config();

export const LOG_LEVEL = (process.env.LOG_LEVEL as string) || 'info';

export const PORT = Number(process.env.PORT) || 1337;

export const DB_URI = process.env.DB_URI as string;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID as string;

export const PROD_BUILD = __filename.endsWith('.js');
