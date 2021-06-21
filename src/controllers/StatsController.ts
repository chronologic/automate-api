import { Request, Response } from 'express';

import { IStatsService } from '../services/stats';

export class StatsController {
  private statsService: IStatsService;

  constructor(statsService: IStatsService) {
    this.statsService = statsService;
  }

  public async getStats(req: Request, res: Response) {
    const stats = await this.statsService.getStats();
    res.json(stats);
  }

  public async getStatsForAddress(req: Request, res: Response) {
    const stats = await this.statsService.getStatsForAddress(req.params.address);
    res.json(stats);
  }
}
