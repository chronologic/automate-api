import { Request, Response } from 'express';

import { IStatsService } from '../services/stats';

export class StatsController {
  private statsService: IStatsService;

  constructor(statsService: IStatsService) {
    this.statsService = statsService;
  }

  public async getStats(req: Request, res: Response) {
    try {
      const stats = await this.statsService.getStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: e });
    }
  }
}
