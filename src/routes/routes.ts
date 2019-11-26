// tslint:disable-next-line:no-implicit-dependencies
import { IRouter } from 'express-serve-static-core';

import { ScheduleController } from '../controllers/ScheduleController';
import { StatsController } from '../controllers/StatsController';
import { ScheduleService } from '../services/schedule';
import { StatsService } from '../services/stats';
import { Tracker } from '../services/tracker';
import { TransactionExecutor } from '../services/transaction';

export class Routes {
  private scheduleController: ScheduleController = new ScheduleController(
    new ScheduleService(new Tracker(), new TransactionExecutor())
  );
  private statsController: StatsController = new StatsController(
    new StatsService()
  );

  public init(app: IRouter): void {
    app
      .route('/scheduled')
      .get(this.scheduleController.getScheduled.bind(this.scheduleController))
      .post(this.scheduleController.schedule.bind(this.scheduleController))
      .delete(this.scheduleController.cancel.bind(this.scheduleController));

    app
      .route('/stats')
      .get(this.statsController.getStats.bind(this.statsController));
  }
}
