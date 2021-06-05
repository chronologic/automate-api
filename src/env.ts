import { config } from 'dotenv';

config();

export const LOG_LEVEL = (process.env.LOG_LEVEL as string) || 'info';

export const PORT = Number(process.env.PORT) || 1337;

export const DB_URI = process.env.DB_URI as string;

export const PROD_BUILD = __filename.endsWith('.js');
