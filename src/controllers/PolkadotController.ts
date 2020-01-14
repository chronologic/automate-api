import { Request, Response } from 'express';

import getApi from '../services/polkadot/api';
import { getNextNonce, parseTx } from '../services/polkadot/utils';

export class PolkadotController {
  public async getBalance(req: Request, res: Response) {
    const api = await getApi();
    const balance = await api.query.balances.freeBalance(req.query.address);
    return res.json({
      balance,
    });
  }

  public async parseTx(req: Request, res: Response) {
    try {
      const parsed = await parseTx(req.query.tx);
      return res.json(parsed);
    } catch (e) {
      return res.status(400).json({
        errors: [e.message],
      });
    }
  }

  public async getNextNonce(req: Request, res: Response) {
    const nonce = await getNextNonce(req.query.address);
    return res.json({
      nonce,
    });
  }
}
