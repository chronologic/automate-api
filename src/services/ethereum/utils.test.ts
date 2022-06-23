import { getProvider } from './utils';
import { ethers } from 'ethers';

import { ARBITRUM_URI, ARBITRUM_RINKEBY_URI, ETHERUM_URI, ROPSTEN_URI } from '../../env';

describe('getProvider', () => {
  test('get RPC Provider of the network based on chainID', () => {
    // given / arrange
    const chainID = 42161;

    // when / act
    const provider = getProvider(chainID);

    // then / assert
    expect(provider).toStrictEqual(new ethers.providers.JsonRpcProvider(ARBITRUM_URI));
  });
});
