import * as bcrypt from 'bcrypt';
import ShortUniqueId from 'short-unique-id';
import { utils } from 'ethers';

import { BadRequestError } from '../errors';
import { IPlatform, IUser, IUserCredits, IUserPublic } from '../models/Models';
import Platform from '../models/PlatformSchema';
import User from '../models/UserSchema';
import { createLogger } from '../logger';

const logger = createLogger('userService');

export interface IUserService {
  login(email: string, password: string): Promise<IUserPublic>;
  signup(email: string, password: string, source?: string): Promise<IUserPublic>;
  loginOrSignup(email: string, password: string): Promise<IUserPublic>;
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

  public static async deductCredits(user: IUser, tx: string): Promise<void> {
    const platform = await UserService.matchTxToPlatform(tx);
    if (platform && platform.credits > 0) {
      await Platform.updateOne({ _id: platform._id }, { credits: Math.max(platform.credits - 1, 0) });
    } else if (user.credits > 0) {
      await User.updateOne({ _id: user._id }, { credits: Math.max(user.credits - 1, 0) });
    } else {
      throw new BadRequestError('Not enough credits');
    }
  }

  public static async matchTxToPlatform(tx: string): Promise<IPlatform> {
    try {
      const parsed = utils.parseTransaction(tx);
      const to = parsed.to.toLowerCase();
      const data = parsed.data.toLowerCase();
      const platforms = await Platform.find();

      for (const platform of platforms) {
        for (const contract of platform.whitelist) {
          const contractLower = contract.toLowerCase();
          const contractNoPrefix = contractLower.substr(2);
          if (to === contractLower || data.includes(contractNoPrefix)) {
            return platform;
          }
        }
      }
    } catch (e) {
      logger.error(e);
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

    const userDb = await User.findOne({ login }).exec();

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

    const userDb = await User.findOne({ login }).exec();

    if (userDb) {
      throw new BadRequestError('Email already taken');
    }

    const salt = await bcrypt.genSalt(5);
    const passwordHash = await bcrypt.hash(password, salt);
    const apiKey = apiKeygen();
    const accessKey = accessKeygen();

    const user = new User({
      login,
      source,
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
    const userDb = await User.findOne({ login }).exec();

    if (userDb) {
      return this.login(login, password);
    }
    return this.signup(login, password);
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
}

// Platform.create({ name: 'name', credits: 123, whitelist: ['0xabc'] } as any);
