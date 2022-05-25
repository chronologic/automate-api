import { NextFunction, Request, Response } from 'express';

import { RequestWithAuth } from '../models/Models';
import { IUserService } from '../services/user';

export class UserController {
  private userService: IUserService;

  constructor(userService: IUserService) {
    this.userService = userService;
  }

  public async loginOrSignup(req: Request, res: Response, next: NextFunction) {
    const user = await this.userService.loginOrSignup(req.body.login, req.body.password);

    res.json(user);
  }

  public async login(req: Request, res: Response) {
    const user = await this.userService.login(req.body.login, req.body.password);

    res.json(user);
  }

  public async signup(req: Request, res: Response) {
    const user = await this.userService.signup(req.body.login, req.body.password, req.body.source);

    res.json(user);
  }

  public async requestResetPassword(req: Request, res: Response) {
    const user = await this.userService.requestResetPassword(req.body.login);

    res.json(user);
  }
  public async resetPassword(req: Request, res: Response) {
    const user = await this.userService.resetPassword(req.body.login, req.body.password, req.body.token);

    res.json(user);
  }
  public async credits(req: RequestWithAuth, res: Response) {
    const credits = await this.userService.getCredits(req.user);

    res.json(credits);
  }
}
