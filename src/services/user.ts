import * as bcrypt from 'bcrypt';
import ShortUniqueId from 'short-unique-id';

import { BadRequestError } from '../errors/BadRequestError';
import { IUser, IUserPublic } from '../models/Models';
import User from '../models/UserSchema';

export interface IUserService {
  loginOrSignup(login: string, password: string): Promise<IUserPublic>;
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

  public async loginOrSignup(
    login: string,
    password: string,
  ): Promise<IUserPublic> {
    this.validatePassword(password);

    const userDb = await User.findOne({ login }).exec();

    if (userDb) {
      await this.validateCredentials(
        password,
        userDb.salt,
        userDb.passwordHash,
      );

      return {
        login,
        // accessKey: userDb.accessKey,
        apiKey: userDb.apiKey,
      };
    } else {
      const salt = await bcrypt.genSalt(5);
      const passwordHash = await bcrypt.hash(password, salt);
      const apiKey = apiKeygen();
      const accessKey = accessKeygen();

      const user = new User({
        login,
        salt,
        passwordHash,
        apiKey,
        accessKey,
        createdAt: new Date().toISOString(),
      });

      await user.save();

      return {
        login,
        // accessKey,
        apiKey,
      };
    }
  }

  private validatePassword(password: string): void {
    if (!/(?=.*[A-Z])(?=.*[a-z]).*/.test(password)) {
      throw new BadRequestError(
        'Password must contain lower and uppercase characters',
      );
    }
    if (!/.{8,}/.test(password)) {
      throw new BadRequestError('Password must be at least 8 characters');
    }
    if (!/(?=.*[0-9\W]).*/.test(password)) {
      throw new BadRequestError('Password must contain a number or a symbol');
    }
  }

  private async validateCredentials(
    password: string,
    salt: string,
    passwordHash: string,
  ): Promise<void> {
    const hashed = await bcrypt.hash(password, salt);
    if (hashed !== passwordHash) {
      throw new BadRequestError('Invalid credentials');
    }
  }
}
