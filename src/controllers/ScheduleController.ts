import e, { Request, Response } from 'express';
import { BadRequestError } from '../errors/BadRequestError';

import { AssetType, Status } from '../models/Models';
import { Key } from '../services/key';
import { IScheduleService } from '../services/schedule';

export class ScheduleController {
  private scheduleService: IScheduleService;

  constructor(scheduleService: IScheduleService) {
    this.scheduleService = scheduleService;
  }

  public async schedule(req: Request, res: Response) {
    try {
      const stored = await this.scheduleService.schedule(
        req.body,
        req.query as any,
      );
      res.json({
        id: stored._id,
        key: Key.generate(stored._id),
        createdAt: stored.createdAt,
        paymentAddress: stored.paymentAddress,
        transactionHash: stored.transactionHash,
      });
    } catch (e) {
      const errors = e.errors
        ? Object.values(e.errors).map((e: any) => e.message)
        : e.message;

      res.status(422);
      res.json({ errors });
    }
  }

  public async getScheduled(req: Request, res: Response) {
    const id: string = req.query.id as string;
    const key: string = req.query.key as string;

    if (!this.auth(id, key, res)) {
      return;
    }

    const scheduled = await this.scheduleService.find(id);

    res.json({
      assetType: scheduled.assetType || AssetType.Ethereum,
      chainId: scheduled.chainId,
      conditionAmount: scheduled.conditionAmount,
      conditionAsset: scheduled.conditionAsset,
      error: scheduled.error,
      id: scheduled._id.toString(),
      signedTransaction: scheduled.signedTransaction,
      status: scheduled.status,
      timeCondition: scheduled.timeCondition || 0,
      timeConditionTZ: scheduled.timeConditionTZ || '',
      transactionHash: scheduled.transactionHash,
      paymentAddress: scheduled.paymentAddress,
      paymentEmail: scheduled.paymentEmail,
      paymentRefundAddress: scheduled.paymentRefundAddress,
      paymentTx: scheduled.paymentTx,
    });
  }

  public async getScheduledByHash(req: Request, res: Response) {
    const scheduled = await this.scheduleService.getByHash(
      req.query.apiKey as any,
      req.query.hash as any,
    );

    res.json(scheduled);
  }

  public async getMaxNonce(req: Request, res: Response) {
    const nonce = await this.scheduleService.getMaxNonce(
      req.query.apiKey as any,
      req.query.address as any,
      req.query.chainId as any,
    );

    res.json({ nonce });
  }

  public async cancel(req: Request, res: Response) {
    const id: string = req.query.id as string;
    const key: string = req.query.key as string;

    if (!this.auth(id, key, res)) {
      return;
    }

    await this.scheduleService.cancel(id);
    res.json({ status: Status.Cancelled });
  }

  public async list(req: Request, res: Response) {
    try {
      const items = await this.scheduleService.listForApiKey(
        req.query.apiKey as any,
      );

      res.json({
        items,
      });
    } catch (e) {
      if (e instanceof BadRequestError) {
        res.status((e as BadRequestError).statusCode);
      }

      res.json({
        error: e?.message,
      });
    }
  }

  private auth(id: string, key: string, res: Response) {
    if (!Key.test(id, key)) {
      res.status(401);
      res.json({ errors: ['Wrong _id and key'] });
      return false;
    }

    return true;
  }
}
