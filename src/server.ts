import { config } from 'dotenv';
import * as http from 'http';

config();

import app from './app';
import logger from './services/logger';

const PORT = process.env.PORT || 3001;

http.createServer(app).listen(PORT, () => {
  logger.info('Express server listening on port ' + PORT);
});
