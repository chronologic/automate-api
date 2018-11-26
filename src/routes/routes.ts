import { Request, Response, NextFunction } from 'express';
import { ScheduleController } from '../controllers/ScheduleController';

export class Routes {
  public contactController: ScheduleController = new ScheduleController();

  public routes(app): void {
    app.route('/').get((req: Request, res: Response) => {
      res.status(200).send({
        message: 'GET request successfulll!!!!'
      });
    });

    // Contact
    app
      .route('/scheduled')
      .get((req: Request, res: Response, next: NextFunction) => {
        // middleware
        console.log(`Request from: ${req.originalUrl}`);
        console.log(`Request type: ${req.method}`);

        next();
      }, this.contactController.getContacts)

      // POST endpoint
      .post(this.contactController.schedule);
  }
}
