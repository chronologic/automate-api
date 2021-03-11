import { Request, Response } from 'express';
import { BadRequestError } from '../errors/BadRequestError';

import { IUserService } from '../services/user';

export class UserController {
  private userService: IUserService;

  constructor(userService: IUserService) {
    this.userService = userService;
  }

  public async loginOrSignup(req: Request, res: Response) {
    try {
      const user = await this.userService.loginOrSignup(
        req.body.login,
        req.body.password,
      );

      res.json(user);
    } catch (e) {
      if (e instanceof BadRequestError) {
        res.status((e as BadRequestError).statusCode);
      }

      res.json({
        error: e?.message,
      });
    }
  }
}
