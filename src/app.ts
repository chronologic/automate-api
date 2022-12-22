import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import expressWinston from 'express-winston';
import mongoose from 'mongoose';
import winston from 'winston';
import 'express-async-errors';

import { LOG_LEVEL } from './env';
import { ApplicationError } from './errors';
import { Routes } from './routes/routes';
import { Manager } from './services/manager';
import { connect } from './db';

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || !process.env.UI_URL || process.env.UI_URL.match(origin) || /https?:\/\/localhost/i.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

class App {
  public app: express.Application;
  public routes: Routes = new Routes();

  constructor() {
    this.app = express();
    this.config();
    this.routes.init(this.app);
    this.app.use((err: ApplicationError, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (res.headersSent) {
        return next(err);
      }

      return res.status(err.status || 500).json({
        error: LOG_LEVEL === 'debug' ? err : err.message,
        message: err.message,
      });
    });
    this.mongoSetup();

    Manager.init();
  }

  private config(): void {
    this.app.use(cors(corsOptions));
    this.app.options('*', cors(corsOptions));
    this.app.use(bodyParser.json());
    // serving static files
    this.app.use(express.static('public'));
    this.app.use(
      expressWinston.logger({
        format: winston.format.combine(winston.format.colorize(), winston.format.json()),
        transports: [new winston.transports.Console()],
      }),
    );
  }

  private mongoSetup(): void {
    connect();
  }
}

export default new App().app;
