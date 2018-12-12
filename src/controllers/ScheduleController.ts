import { Request, Response } from 'express';
import { IScheduleService } from 'services/schedule';

import { Key } from '../services/key';

export class ScheduleController {
  private _scheduleService: IScheduleService;

  constructor(scheduleService: IScheduleService) {
    this._scheduleService = scheduleService;
  }

  public async schedule(req: Request, res: Response) {
    try {
      const stored = await this._scheduleService.schedule(req.body);
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

    if (!ScheduleController.auth(id, key, res)) {
      return;
    }

    const scheduled = await this._scheduleService.find(id);

    res.json({
      id: scheduled._id.toString(),
      error: scheduled.error,
      signedTransaction: scheduled.signedTransaction,
      conditionAsset: scheduled.conditionAsset,
      conditionAmount: scheduled.conditionAmount,
      status: scheduled.status,
      transactionHash: scheduled.transactionHash
    });
  }

  public async cancel(req: Request, res: Response) {
    const id: string = req.query.id;
    const key: string = req.query.key;

    if (!ScheduleController.auth(id, key, res)) {
      return;
    }

    const status = await this._scheduleService.cancel(id);
    res.json({ status });
  }

  private static auth(id: string, key: string, res: Response) {
    if (!Key.test(id, key)) {
      res.status(401);
      res.json({ errors: ['Wrong _id and key'] });
      return false;
    }

    return true;
  }
}
