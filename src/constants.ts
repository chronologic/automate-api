export const SECOND_MILLIS = 1000;
export const MINUTE_MILLIS = 60 * SECOND_MILLIS;
export const HOUR_MILLIS = 60 * MINUTE_MILLIS;
export const DAY_MILLIS = 24 * HOUR_MILLIS;
export const ETH_DECIMALS = 18;
export const GWEI_DECIMALS = 9;
export enum ChainId {
  None = -1,
  Arbitrum = 42161,
  Ethereum = 1,
  Ropsten = 3,
  // Arbitrum_Rinkeby = 421611,
}
export enum BlockExplorerUrl {
  None = '',
  Arbitrum = 'https://arbiscan.io/',
  Ethereum = 'https://etherscan.io/',
  Ropsten = 'https://ropsten.etherscan.io/',
  Arbitrum_Rinkeby = 'https://testnet.arbiscan.io/',
}
