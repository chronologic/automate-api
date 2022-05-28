import { Request, Response } from 'express';

import { RequestWithAuth } from '../models/Models';
import paymentService from '../services/payment';

export const paymentController = {
  initializePayment,
  getPaymentAddress,
};

async function getPaymentAddress(req: Request, res: Response) {
  const result = await paymentService.getPaymentAddress();

  res.json(result);
}

async function initializePayment(req: RequestWithAuth, res: Response) {
  const result = await paymentService.initializePayment(req.user.id, req.body.from);

  res.json(result);
}
