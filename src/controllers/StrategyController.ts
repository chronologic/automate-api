import { NextFunction, Request, Response } from 'express';

import { RequestWithAuth } from '../models/Models';
import { strategyService } from '../services/strategy';

export const strategyController = {
  prep,
  deletePrepInstance,
};

async function prep(req: RequestWithAuth, res: Response) {
  const result = await strategyService.prep(req.user.id, req.body);

  res.json(result);
}

async function deletePrepInstance(req: RequestWithAuth, res: Response) {
  await strategyService.deletePrepInstance(req.user.id, req.params.id);

  res.status(204).send();
}
