import { PolkadotChainId } from '../../models/Models';

import { IdentityTypes } from './types/edgeware/identity';
import { SignalingTypes } from './types/edgeware/signaling';
import { TreasuryRewardTypes } from './types/edgeware/treasuryReward';
import { VotingTypes } from './types/edgeware/voting';

interface IPolkadotChain {
  uri: string;
  tokenSymbol: string;
  decimals: number;
  name: string;
  types: {
    [key: string]: any;
  };
}

const chains: {
  [key in PolkadotChainId]?: IPolkadotChain;
} = {};

chains[PolkadotChainId.Kusama] = {
  uri: process.env.POLKADOT_URI,
  decimals: 12,
  tokenSymbol: 'KSM',
  name: PolkadotChainId[PolkadotChainId.Kusama],
  types: {
    Keys: 'SessionKeys5',
  },
};

chains[PolkadotChainId.EdgewareTestnet4] = {
  uri: process.env.EDGEWARE_URI,
  decimals: 18,
  tokenSymbol: 'EDG',
  name: PolkadotChainId[PolkadotChainId.EdgewareTestnet4],
  types: {
    Keys: 'SessionKeys3',
    ValidatorPrefs: 'ValidatorPrefsTo196',
    ...IdentityTypes,
    ...SignalingTypes,
    ...TreasuryRewardTypes,
    ...VotingTypes,
  },
};

export default chains;
