import { config } from 'dotenv';
import * as http from 'http';

config();

import app from './app';
import makeLogger from './services/logger';

const PORT = process.env.PORT || 3001;
const logger = makeLogger('server');

http.createServer(app).listen(PORT, () => {
  logger.info('Express server listening on port ' + PORT);
});
