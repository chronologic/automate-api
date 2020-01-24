import { Request, Response } from 'express';

import getApi from '../services/polkadot/api';

export class PolkadotController {
  public async getBalance(req: Request, res: Response) {
    const api = await getApi(+req.query.chainId);
    const balance = await api.query.balances.freeBalance(req.query.address);
    return res.json({
      balance,
    });
  }

  public async parseTx(req: Request, res: Response) {
    try {
      const api = await getApi(+req.query.chainId);
      const parsed = await api.parseTx(req.query.tx);
      return res.json(parsed);
    } catch (e) {
      return res.status(400).json({
        errors: [e.message],
      });
    }
  }

  public async getNextNonce(req: Request, res: Response) {
    const api = await getApi(+req.query.chainId);
    const nonce = await api.getNextNonce(req.query.address);
    return res.json({
      nonce,
    });
  }
}
