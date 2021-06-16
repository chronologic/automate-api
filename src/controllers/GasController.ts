import { Request, Response } from 'express';

import { gasService } from '../services/ethereum/gas';

async function estimateGas(req: Request, res: Response) {
  const estimate = await gasService.estimateGas(req.query.confirmationTime as any);

  res.send(estimate);
}

async function estimateGasSavings(req: Request, res: Response) {
  const savings = await gasService.estimateGasSavings();

  res.send(savings);
}

const gasController = {
  estimateGas,
  estimateGasSavings,
};

export { gasController };
