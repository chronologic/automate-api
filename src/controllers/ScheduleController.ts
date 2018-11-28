import Scheduled, { IScheduled } from '../models/ScheduledSchema';
import { Request, Response } from 'express';
import { Watcher } from '../services/watcher';
import { Key } from '../services/key';

export class ScheduleController {
  public schedule(req: Request, res: Response) {
    const scheduled = new Scheduled(req.body);
    scheduled.completed = false;

    scheduled.save((err, stored: IScheduled) => {
      if (err) {
        const errors = Object.values(err.errors).map(
          (e: any) => e.message
        );

        res.status(422);
        res.json({ errors });
      } else {
        console.log(`Schedule:::save=${stored}`);
        
        Watcher.watch(stored);
                
        res.json({
          _id: stored._id,
          key: Key.generate(stored._id)
        });  
      }
    });
  }

  public getContacts(req: Request, res: Response) {
    Scheduled.find({}, (err, contact) => {
      if (err) {
        res.send(err);
      }
      res.json(contact);
    });
  }
}
