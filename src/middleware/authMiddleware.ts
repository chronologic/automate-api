import { Response, NextFunction } from 'express';

import logger from '../logger';
import { UnauthorizedError } from '../errors';
import { RequestWithAuth } from '../models/Models';
import { UserService } from '../services/user';

export const authMiddleware = async (req: RequestWithAuth, res: Response, next: NextFunction) => {
  const token = decodeAuthHeader(req.headers.authorization);

  if (!token) {
    logger.debug('Auth token missing');
    return next(new UnauthorizedError());
  }

  let user;

  try {
    user = await UserService.validateApiKey(token);
  } catch (e) {
    logger.error(e);
    return next(e);
  }

  if (!user) {
    logger.debug('User not found');
    return next(new UnauthorizedError());
  }

  req.user = user;
  return next();
};

function decodeAuthHeader(header: string): string {
  try {
    const authToken = header.split(' ')[1];

    return authToken;
  } catch (e) {
    logger.error(e);
    return null;
  }
}

export default authMiddleware;
