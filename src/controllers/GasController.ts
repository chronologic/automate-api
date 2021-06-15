import { Request, Response } from 'express';

import { gasService } from '../services/ethereum/gas';

async function estimateGasSavings(req: Request, res: Response) {
  const savings = await gasService.estimateGasSavings();

  res.send(savings);
}

const gasController = {
  estimateGasSavings,
};

export { gasController };
