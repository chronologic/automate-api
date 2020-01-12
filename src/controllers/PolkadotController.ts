import { Request, Response } from 'express';

import { getNextNonce, parseTx } from '../services/polkadot/utils';
import getApi from '../services/polkadot/api';

export class PolkadotController {
  public async getBalance(req: Request, res: Response) {
    const api = await getApi();
    const balance = await api.query.balances.freeBalance(req.query.address);
    return res.json({
      balance,
    });
  }

  public async parseTx(req: Request, res: Response) {
    const parsed = await parseTx(req.query.tx);
    return res.json(parsed);
  }

  public async getNextNonce(req: Request, res: Response) {
    const nonce = await getNextNonce(req.query.address);
    return res.json({
      nonce,
    });
  }
}
