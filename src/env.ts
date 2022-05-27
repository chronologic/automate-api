import { config } from 'dotenv';

config();

export const LOG_LEVEL = (process.env.LOG_LEVEL as string) || 'info';

// tslint:disable-next-line: no-console
console.log('LOG LEVEL:', LOG_LEVEL);

export const PORT = Number(process.env.PORT) || 1337;

export const DB_URI = process.env.DB_URI as string;

export const ARBITRUM_URI = process.env.ARBITRUM_URI;
export const ARBITRUM_RINKEBY_URI = process.env.ARBITRUM_RINKEBY_URI;
export const ETHERUM_URI = process.env.ETHEREUM_URI;
export const ROPSTEN_URI = process.env.ROPSTEN_URI;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID as string;

export const GAS_PRICE_FEED_URL = process.env.GAS_PRICE_FEED_URL as string;
export const CURRENT_GAS_PRICE_FEED_URL = process.env.CURRENT_GAS_PRICE_FEED_URL as string;

export const CREDITS = process.env.CREDITS === 'true';
export const NEW_USER_CREDITS = Number(process.env.NEW_USER_CREDITS);

export const SKIP_TX_BROADCAST = process.env.SKIP_TX_BROADCAST === 'true';

export const PROD_BUILD = __filename.endsWith('.js');

export const PAYMENT = process.env.PAYMENT === 'true';
export const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS as string;
