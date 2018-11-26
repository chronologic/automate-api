import * as mongoose from 'mongoose';
import Scheduled, { IScheduled } from '../models/ScheduledSchema';
import { Request, Response } from 'express';
import { Watcher } from '../services/watcher';

export class ScheduleController {
  public schedule(req: Request, res: Response) {
    console.log(req.body)

    const scheduled = new Scheduled(req.body);
    scheduled.completed = false;

    scheduled.save((err, stored: IScheduled) => {
      if (err) {
        res.send(err);
      }
      console.log('success. saved!');
      Watcher.watch(stored);

      res.json(stored);
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
