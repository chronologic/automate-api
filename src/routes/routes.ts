// tslint:disable-next-line:no-implicit-dependencies
import { IRouter } from 'express-serve-static-core';

import { PolkadotController } from '../controllers/PolkadotController';
import { ScheduleController } from '../controllers/ScheduleController';
import { StatsController } from '../controllers/StatsController';
import { UserController } from '../controllers/UserController';
import { ScheduleService } from '../services/schedule';
import { StatsService } from '../services/stats';
import { UserService } from '../services/user';

export class Routes {
  private scheduleController: ScheduleController = new ScheduleController(
    new ScheduleService(),
  );
  private statsController: StatsController = new StatsController(
    new StatsService(),
  );
  private polkadotController: PolkadotController = new PolkadotController();
  private userController: UserController = new UserController(
    new UserService(),
  );

  public init(app: IRouter): void {
    app
      .route('/scheduled')
      .get(this.scheduleController.getScheduled.bind(this.scheduleController))
      .post(this.scheduleController.schedule.bind(this.scheduleController))
      .delete(this.scheduleController.cancel.bind(this.scheduleController));

    app
      .route('/scheduled/byHash')
      .get(
        this.scheduleController.getScheduledByHash.bind(
          this.scheduleController,
        ),
      );

    app
      .route('/scheduleds')
      .get(this.scheduleController.list.bind(this.scheduleController));

    app
      .route('/address/maxNonce')
      .get(this.scheduleController.getMaxNonce.bind(this.scheduleController));

    app
      .route('/stats')
      .get(this.statsController.getStats.bind(this.statsController));

    app
      .route('/polkadot/balance')
      .get(this.polkadotController.getBalance.bind(this.polkadotController));
    app
      .route('/polkadot/parseTx')
      .get(this.polkadotController.parseTx.bind(this.polkadotController));
    app
      .route('/polkadot/nextNonce')
      .get(this.polkadotController.getNextNonce.bind(this.polkadotController));

    app
      .route('/auth')
      .post(this.userController.loginOrSignup.bind(this.userController));
  }
}
