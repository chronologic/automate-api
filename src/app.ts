import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as express from 'express';
import * as expressWinston from 'express-winston';
import * as mongoose from 'mongoose';
import * as winston from 'winston';

import { Routes } from './routes/routes';
import { Manager } from './services/manager';

const corsOptions = {
  origin: process.env.UI_URL,
};

class App {
  public app: express.Application;
  public routes: Routes = new Routes();
  public mongoUrl: string =
    process.env.DB_URI || 'mongodb://root:example@localhost:27017';

  constructor() {
    this.app = express();
    this.config();
    this.routes.init(this.app);
    this.mongoSetup();

    Manager.init();
  }

  private config(): void {
    this.app.use(bodyParser.json());
    // serving static files
    this.app.use(express.static('public'));
    this.app.use(cors(corsOptions));
    this.app.use(
      expressWinston.logger({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.json(),
        ),
        transports: [new winston.transports.Console()],
      }),
    );
  }

  private mongoSetup(): void {
    // mongoose.Promise = global.Promise;
    mongoose.connect(this.mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
}

export default new App().app;
