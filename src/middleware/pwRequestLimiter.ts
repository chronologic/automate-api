import { rateLimit } from 'express-rate-limit';
import { MINUTE_MILLIS } from '../constants';

export const pwRequestLimiter = rateLimit({
  windowMs: 10 * MINUTE_MILLIS,
  max: 3,
  message: 'Too many requests, please try again later.',
});

export default pwRequestLimiter;
