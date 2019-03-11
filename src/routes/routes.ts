// tslint:disable-next-line:no-implicit-dependencies
import { IRouter } from 'express-serve-static-core';

import { ScheduleController } from '../controllers/ScheduleController';
import { ScheduleService } from '../services/schedule';
import { Tracker } from '../services/tracker';

export class Routes {
  private scheduleController: ScheduleController = new ScheduleController(
    new ScheduleService(new Tracker())
  );

  public init(app: IRouter): void {
    app
      .route('/scheduled')
      .get(this.scheduleController.getScheduled.bind(this.scheduleController))
      .post(this.scheduleController.schedule.bind(this.scheduleController))
      .delete(this.scheduleController.cancel.bind(this.scheduleController));
  }
}
