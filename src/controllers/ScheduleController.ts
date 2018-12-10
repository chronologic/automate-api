import Scheduled from '../models/ScheduledSchema';
import { Request, Response } from 'express';
import { Watcher } from '../services/watcher';
import { Key } from '../services/key';
import { Status, IScheduled } from '../models/Models';

export class ScheduleController {
  public async schedule(req: Request, res: Response) {
    const scheduled = new Scheduled(req.body);
    scheduled.status = Status.Pending;

    try {
      const stored = await scheduled.save();
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

    const scheduled = await Scheduled.findById(id).exec();
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

    const status = await Watcher.cancel(id);
    res.json({ status });
  }

  public static auth(id: string, key: string, res: Response) {
    if (!Key.test(id, key)) {
      res.status(401);
      res.json({ errors: ['Wrong _id and key'] });
      return false;
    }

    return true;
  }
}
