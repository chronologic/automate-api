import { Response } from 'express';

import { RequestWithAuth } from '../models/Models';
import paymentService from '../services/payment';

export const paymentController = {
  initializePayment,
};

async function initializePayment(req: RequestWithAuth, res: Response) {
  const result = await paymentService.initializePayment(req.user.id, req.body.from);

  res.json(result);
}
