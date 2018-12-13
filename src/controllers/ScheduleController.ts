import { Request, Response } from 'express';

import { Status } from '../models/Models';
import { Key } from '../services/key';
import { IScheduleService } from '../services/schedule';

export class ScheduleController {
  private scheduleService: IScheduleService;

  constructor(scheduleService: IScheduleService) {
    this.scheduleService = scheduleService;
  }

  public async schedule(req: Request, res: Response) {
    try {
      const stored = await this.scheduleService.schedule(req.body);
      res.json({
        id: stored._id,
        key: Key.generate(stored._id)
      });
    } catch (e) {
      const errors = Object.values(e.errors).map((e: any) => e.message);

      res.status(422);
      res.json({ errors });
    }
  }

  public async getScheduled(req: Request, res: Response) {
    const id: string = req.query.id;
    const key: string = req.query.key;

    if (!this.auth(id, key, res)) {
      return;
    }

    const scheduled = await this.scheduleService.find(id);

    res.json({
      conditionAmount: scheduled.conditionAmount,
      conditionAsset: scheduled.conditionAsset,
      error: scheduled.error,
      id: scheduled._id.toString(),
      signedTransaction: scheduled.signedTransaction,
      status: scheduled.status,
      transactionHash: scheduled.transactionHash
    });
  }

  public async cancel(req: Request, res: Response) {
    const id: string = req.query.id;
    const key: string = req.query.key;

    if (!this.auth(id, key, res)) {
      return;
    }

    await this.scheduleService.cancel(id);
    res.json({ status: Status.Cancelled });
  }

  private auth(id: string, key: string, res: Response) {
    if (!Key.test(id, key)) {
      res.status(401);
      res.json({ errors: ['Wrong _id and key'] });
      return false;
    }

    return true;
  }
}
