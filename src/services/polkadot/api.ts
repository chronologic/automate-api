import { ApiPromise, WsProvider } from '@polkadot/api';
import logger from './logger';

let apiPromise: Promise<ApiPromise>;

export default async function getApi() {
  if (apiPromise) {
    const api = await apiPromise;
    try {
      await api.query.timestamp.now();
      return apiPromise;
    } catch (e) {
      try {
        api.disconnect();
        // tslint:disable-next-line: no-empty
      } catch (e) {}
      logger.error(e);
      logger.debug('connection dropped, reconnecting...');
    }
  }

  const wsProvider = new WsProvider(process.env.POLKADOT_URI);
  apiPromise = ApiPromise.create({ provider: wsProvider });

  return apiPromise;
}
