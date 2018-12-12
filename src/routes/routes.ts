import { Request, Response, NextFunction } from 'express';
import { ScheduleController } from '../controllers/ScheduleController';
import { IRouter } from 'express-serve-static-core';
import { ScheduleService } from '../services/schedule';

export class Routes {
  private scheduleController: ScheduleController = new ScheduleController(
    new ScheduleService()
  );

  public init(app: IRouter): void {
    app
      .route('/scheduled')
      .get(this.scheduleController.getScheduled.bind(this.scheduleController))
      .post(this.scheduleController.schedule.bind(this.scheduleController))
      .delete(this.scheduleController.cancel.bind(this.scheduleController));
  }
}
