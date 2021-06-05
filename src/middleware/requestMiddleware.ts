import { RequestHandler, Request, Response, NextFunction } from 'express';

import { LOG_LEVEL } from '../env';
import logger from '../logger';

/**
 * This router wrapper catches any error from async await
 * and throws it to the default express error handler,
 * instead of crashing the app
 * @param handler Request handler to check for error
 */
export const requestMiddleware = (
  handler: RequestHandler,
): RequestHandler => async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    return await handler(req, res, next);
  } catch (err) {
    if (LOG_LEVEL === 'debug') {
      logger.error(err);
    }
    return next(err);
  }
};

export default requestMiddleware;
