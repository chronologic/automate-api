import { Request, Response } from 'express';
import { RequestWithAuth, Status } from '../models/Models';

import { IScheduleService } from '../services/schedule';
import { transactionService } from '../services/transaction';

export class TransactionController {
  private scheduleService: IScheduleService;

  constructor(scheduleService: IScheduleService) {
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
    const items = await transactionService.list(req.user.apiKey, req.query);

    res.json({
      items,
    });
  }

  // TODO: verify user owns tx
  public async cancel(req: Request, res: Response) {
    const id: string = req.query.id as string;

    await transactionService.cancel(id);
    res.json({ status: Status.Cancelled });
  }

  public async batchUpdateNotes(req: RequestWithAuth, res: Response) {
    await transactionService.batchUpdateNotes(req.user.apiKey, req.body);
    res.json({ status: 'ok' });
  }
}
