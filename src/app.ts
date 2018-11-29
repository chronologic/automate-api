import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as express from 'express';
import * as mongoose from 'mongoose';

import { Routes } from './routes/routes';
import { Watcher } from './services/watcher';

class App {

    public app: express.Application;
    public routes: Routes = new Routes();
    public mongoUrl: string = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017';

    constructor() {
        this.app = express();
        this.config();        
        this.routes.init(this.app);     
        this.mongoSetup();

        Watcher.init();
    }

    private config(): void{
        this.app.use(bodyParser.json());
        //this.app.use(bodyParser.urlencoded({ extended: true }));
        // serving static files 
        this.app.use(express.static('public'));
        this.app.use(cors());
    }

    private mongoSetup(): void{
        // mongoose.Promise = global.Promise;
        mongoose.connect(this.mongoUrl);        
    }

}

export default new App().app;