import { NextFunction, Request, Response } from 'express';

import { RequestWithAuth } from '../models/Models';
import { strategyService } from '../services/strategy';

export const strategyController = {
  prep,
  cancelPrep,
};

async function prep(req: Request, res: Response) {
  res.json();
}

async function cancelPrep(req: Request, res: Response) {
  res.json();
}
