import * as bcrypt from 'bcrypt';
import ShortUniqueId from 'short-unique-id';
import jwt from 'jsonwebtoken';

import { AssetType, IPlatform, IUser, IUserCredits, IUserPublic, IUserResetPassword } from '../models/Models';
import Platform from '../models/PlatformSchema';
import User from '../models/UserSchema';
import { NEW_USER_CREDITS, JWT_SECRET } from '../env';
import { BadRequestError } from '../errors';
import { sendResetPasswordEmail } from './mail';
import platformService from './platform';

export interface IUserService {
  login(email: string, password: string): Promise<IUserPublic>;
  signup(email: string, password: string, source?: string): Promise<IUserPublic>;
  loginOrSignup(email: string, password: string): Promise<IUserPublic>;
  requestResetPassword(email: string): Promise<IUserResetPassword>;
  resetPassword(email: string, password: string, token: string);
  getCredits(user: IUser): Promise<IUserCredits>;
}

const apiKeygen = new ShortUniqueId({ length: 16 });
const accessKeygen = new ShortUniqueId({ length: 8 });

export class UserService implements IUserService {
  public static async validateApiKey(apiKey: string): Promise<IUser> {
    const user = await User.findOne({ apiKey });

    if (!user) {
      throw new BadRequestError('Invalid API key');
    }

    return user;
  }

  public static async deductCredits(user: IUser, tx: string, assetType: AssetType): Promise<void> {
    const platform = await platformService.matchTxToPlatform(tx, assetType);
    if (platform && platform.credits > 0) {
      await Platform.updateOne({ _id: platform._id }, { credits: Math.max(platform.credits - 1, 0) });
    } else if (user.credits > 0) {
      await User.updateOne({ _id: user._id }, { credits: Math.max(user.credits - 1, 0) });
    } else {
      throw new BadRequestError('Insufficient Automate credits');
    }
  }

  public async getCredits(user: IUser): Promise<IUserCredits> {
    const platform = await Platform.findOne({ name: user.source });

    return {
      user: user.credits || 0,
      community: platform?.credits || 0,
    };
  }

  public async login(login: string, password: string): Promise<IUserPublic> {
    this.validateEmail(login);
    this.validatePassword(password);

    const userDb = await this.findUserInDb(login);

    if (userDb) {
      await this.validateCredentials(password, userDb.salt, userDb.passwordHash);

      return {
        login,
        source: userDb.source,
        // accessKey: userDb.accessKey,
        apiKey: userDb.apiKey,
      };
    }

    throw new BadRequestError('Invalid credentials');
  }

  public async signup(login: string, password: string, source?: string): Promise<IUserPublic> {
    this.validateEmail(login);
    this.validatePassword(password);

    const userDb = await this.findUserInDb(login);

    if (userDb) {
      throw new BadRequestError('Email already taken');
    }
    const credits = NEW_USER_CREDITS;
    const { salt, hash: passwordHash } = await this.generateSaltAndHash(password);
    const apiKey = apiKeygen();
    const accessKey = accessKeygen();

    const user = new User({
      login,
      source,
      credits,
      salt,
      passwordHash,
      apiKey,
      accessKey,
      createdAt: new Date().toISOString(),
    });

    await user.save();

    return {
      login,
      source,
      // accessKey,
      apiKey,
    };
  }

  public async loginOrSignup(login: string, password: string): Promise<IUserPublic> {
    const userDb = await this.findUserInDb(login);

    if (userDb) {
      return this.login(login, password);
    }
    return this.signup(login, password);
  }

  public async requestResetPassword(login: string): Promise<IUserResetPassword> {
    this.validateEmail(login);
    const userDb = await this.findUserInDb(login);
    if (userDb) {
      const secret = JWT_SECRET + userDb.passwordHash;
      const paylod = {
        email: login,
        id: userDb._id,
      };
      const token = jwt.sign(paylod, secret, { expiresIn: '1h' });
      const resetUrl = '?token=' + token + '&email=' + login;
      sendResetPasswordEmail(login, resetUrl);
      const resetLink = `${token} `;
      return {
        login,
        link: resetLink,
      };
    }
  }

  public async resetPassword(login: string, password: string, token: string): Promise<IUserResetPassword> {
    try {
      this.validatePassword(password);
      const userDb = await this.findUserInDb(login);
      const secret = JWT_SECRET + userDb.passwordHash;
      jwt.verify(token, secret);
      if (userDb) {
        const { salt: pwSalt, hash: pwHash } = await this.generateSaltAndHash(password);
        await User.updateOne({ _id: userDb._id }, { salt: pwSalt, passwordHash: pwHash });
        return {
          login,
          link: token,
        };
      }
    } catch (error) {
      throw new BadRequestError('Password reset is unsuccessful please request a new email.');
    }
  }

  private validateEmail(email: string): void {
    const emailRegex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/i;
    if (!emailRegex.test(email)) {
      throw new BadRequestError('Invalid email');
    }
  }

  private validatePassword(password: string): void {
    if (!/(?=.*[A-Z])(?=.*[a-z]).*/.test(password)) {
      throw new BadRequestError('Password must contain lower and uppercase characters');
    }
    if (!/.{8,}/.test(password)) {
      throw new BadRequestError('Password must be at least 8 characters');
    }
    if (!/(?=.*[0-9\W]).*/.test(password)) {
      throw new BadRequestError('Password must contain a number or a symbol');
    }
  }

  private async validateCredentials(password: string, salt: string, passwordHash: string): Promise<void> {
    const hashed = await bcrypt.hash(password, salt);
    if (hashed !== passwordHash) {
      throw new BadRequestError('Invalid credentials');
    }
  }

  private async generateSaltAndHash(password: string): Promise<{ salt: string; hash: string }> {
    const salt = await bcrypt.genSalt(5);
    const hash = await bcrypt.hash(password, salt);
    return {
      salt,
      hash,
    };
  }

  private async findUserInDb(login: string): Promise<IUser> {
    const userDb = await User.findOne({ login }).collation({ locale: 'en', strength: 2 }).exec();
    return userDb;
  }
}

// Platform.create({ name: 'name', credits: 123, whitelist: ['0xabc'] } as any);
