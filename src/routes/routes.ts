// tslint:disable-next-line:no-implicit-dependencies
import { IRouter } from 'express-serve-static-core';

import { authMiddleware, pwRequestLimiter } from '../middleware';
import { ScheduleService } from '../services/schedule';
import { StatsService } from '../services/stats';
import { UserService } from '../services/user';
import { PolkadotController } from '../controllers/PolkadotController';
import { ScheduleController } from '../controllers/ScheduleController';
import { StatsController } from '../controllers/StatsController';
import { UserController } from '../controllers/UserController';
import { TransactionController } from '../controllers/TransactionController';
import { gasController } from '../controllers/GasController';
import { strategyController } from '../controllers/StrategyController';
import { paymentController } from '../controllers/PaymentController';

export class Routes {
  private scheduleController: ScheduleController = new ScheduleController(new ScheduleService());
  private statsController: StatsController = new StatsController(new StatsService());
  private polkadotController: PolkadotController = new PolkadotController();
  private userController: UserController = new UserController(new UserService());
  private transactionController: TransactionController = new TransactionController(new ScheduleService());

  public init(app: IRouter): void {
    app
      .route('/scheduled')
      .get(this.scheduleController.getScheduled.bind(this.scheduleController))
      .post(this.scheduleController.schedule.bind(this.scheduleController))
      .delete(this.scheduleController.cancel.bind(this.scheduleController));

    app.route('/scheduled/byHash').get(this.scheduleController.getScheduledByHash.bind(this.scheduleController));

    app.route('/scheduleds').get(this.scheduleController.list.bind(this.scheduleController));

    app.route('/address/maxNonce').get(this.scheduleController.getMaxNonce.bind(this.scheduleController));

    app.route('/stats').get(this.statsController.getStats.bind(this.statsController));
    app.route('/stats/:address').get(this.statsController.getStatsForAddress.bind(this.statsController));

    app.route('/polkadot/balance').get(this.polkadotController.getBalance.bind(this.polkadotController));
    app.route('/polkadot/parseTx').get(this.polkadotController.parseTx.bind(this.polkadotController));
    app.route('/polkadot/nextNonce').get(this.polkadotController.getNextNonce.bind(this.polkadotController));

    app.route('/ethereum/estimateGasSavings').get(gasController.estimateGasSavings);
    app.route('/ethereum/estimateGas').get(gasController.estimateGas);

    ///////// user specific

    app.route('/auth').post(this.userController.loginOrSignup.bind(this.userController));
    app.route('/auth/login').post(this.userController.login.bind(this.userController));
    app.route('/auth/signup').post(this.userController.signup.bind(this.userController));
    app
      .route('/auth/requestResetPassword')
      .post(pwRequestLimiter, this.userController.requestResetPassword.bind(this.userController));

    app.route('/auth/resetPassword').post(this.userController.resetPassword.bind(this.userController));

    app.route('/user/credits').get(authMiddleware, this.userController.credits.bind(this.userController));

    app
      .route('/transactions')
      .get(authMiddleware, this.transactionController.list.bind(this.transactionController))
      .post(authMiddleware, this.transactionController.edit.bind(this.transactionController))
      .delete(authMiddleware, this.transactionController.cancel.bind(this.transactionController));

    app
      .route('/transactions/batchUpdateNotes')
      .post(authMiddleware, this.transactionController.batchUpdateNotes.bind(this.transactionController));

    ///////// payments

    app.route('/payments/address').get(paymentController.getPaymentAddress);
    app.route('/payments/initialize').post(authMiddleware, paymentController.initializePayment);

    ///////// strategies

    app.route('/strategy/prep').post(authMiddleware, strategyController.prep);
    app.route('/strategy/prep/:id').delete(authMiddleware, strategyController.deletePrepInstance);
  }
}
