import { Request, Response } from 'express';
import { RequestWithAuth, Status } from '../models/Models';

import { IScheduleService } from '../services/schedule';
import { ITransactionService } from '../services/transaction';

export class TransactionController {
  private transactionService: ITransactionService;
  private scheduleService: IScheduleService;

  constructor(
    transactionService: ITransactionService,
    scheduleService: IScheduleService,
  ) {
    this.transactionService = transactionService;
    this.scheduleService = scheduleService;
  }

  // TODO: verify user owns tx
  public async edit(req: RequestWithAuth, res: Response) {
    const stored = await this.scheduleService.schedule(req.body, {
      ...req.query,
      apiKey: req.user.apiKey,
    });
    res.json(stored);
  }

  public async list(req: RequestWithAuth, res: Response) {
    const items = await this.transactionService.list(req.user.apiKey);

    res.json({
      items,
    });
  }

  // TODO: verify user owns tx
  public async cancel(req: Request, res: Response) {
    const id: string = req.query.id as string;

    await this.transactionService.cancel(id);
    res.json({ status: Status.Cancelled });
  }
}
