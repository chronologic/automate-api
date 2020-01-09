import { ethers } from 'ethers';

export class Key {
  public static generate(id: string) {
    const hex = ethers.utils.toUtf8Bytes(id + this.SALT);
    return ethers.utils.keccak256(hex);
  }

  public static test(id: string, key: string) {
    return this.generate(id) === key;
  }

  private static SALT = process.env.SALT || 'HqTZ4xN0Ej';
}
