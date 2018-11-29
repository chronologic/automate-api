import { Request, Response, NextFunction } from 'express';
import { ScheduleController } from '../controllers/ScheduleController';
import { IRouter } from 'express-serve-static-core';

export class Routes {
  private scheduleController: ScheduleController = new ScheduleController();

  public init(app: IRouter): void {
    app
      .route('/scheduled')
      .get(this.scheduleController.getScheduled)
      .post(this.scheduleController.schedule)
      .delete(this.scheduleController.cancel)
  }
}
