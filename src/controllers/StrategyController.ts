import { NextFunction, Request, Response } from 'express';

import { RequestWithAuth } from '../models/Models';
import { strategyService } from '../services/strategy';

export const strategyController = {
  prep,
  cancelPrep,
};

async function prep(req: RequestWithAuth, res: Response) {
  const result = await strategyService.prep(req.user.id, req.body);

  res.json(result);
}

async function cancelPrep(req: RequestWithAuth, res: Response) {
  await strategyService.cancelPrep(req.user.id, req.params.id);

  res.status(204).send();
}
