import * as express from "express";
import * as bodyParser from "body-parser";
import { Routes } from "./routes/routes";
import * as mongoose from "mongoose";
import { Watcher } from "./services/watcher";

class App {

    public app: express.Application;
    public routePrv: Routes = new Routes();
    public mongoUrl: string = 'mongodb://root:example@localhost:27017';

    constructor() {
        this.app = express();
        this.config();        
        this.routePrv.routes(this.app);     
        this.mongoSetup();

        Watcher.init();
    }

    private config(): void{
        this.app.use(bodyParser.json());
        //this.app.use(bodyParser.urlencoded({ extended: true }));
        // serving static files 
        this.app.use(express.static('public'));
    }

    private mongoSetup(): void{
        // mongoose.Promise = global.Promise;
        mongoose.connect(this.mongoUrl);        
    }

}

export default new App().app;