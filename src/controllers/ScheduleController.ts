import Scheduled from '../models/ScheduledSchema';
import { Request, Response } from 'express';
import { Watcher } from '../services/watcher';
import { Key } from '../services/key';
import { Status, IScheduled } from '../models/Models';

export class ScheduleController {
  public schedule(req: Request, res: Response) {
    const scheduled = new Scheduled(req.body);
    scheduled.status = Status.Pending;

    scheduled.save((err, stored: IScheduled) => {
      if (err) {
        console.log(err);
        const errors = Object.values(err.errors).map((e: any) => e.message);

        res.status(422);
        res.json({ errors });
      } else {
        console.log(`Schedule:::save=${stored}`);

        res.json({
          id: stored._id,
          key: Key.generate(stored._id)
        });
      }
    });
  }

  public getScheduled(req: Request, res: Response) {
    const id: string = req.query.id;
    const key: string = req.query.key;

    if (!ScheduleController.auth(id, key, res)) {
      return;
    }

    Scheduled.findById(id, (err, scheduled) => {
      if (err) {
        res.send(err);
      }

      res.json({
        id: scheduled._id.toString(),
        error: scheduled.error,
        signedTransaction: scheduled.signedTransaction,
        conditionAsset: scheduled.conditionAsset,
        conditionAmount: scheduled.conditionAmount,
        status: scheduled.status,
        transactionHash: scheduled.transactionHash
      });
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
