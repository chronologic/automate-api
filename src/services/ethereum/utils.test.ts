import { getProvider, getBlockNumber } from './utils';
import { ethers } from 'ethers';
import { ChainId } from '../../constants';

import { ARBITRUM_URI, ARBITRUM_RINKEBY_URI, ETHEREUM_URI, ROPSTEN_URI } from '../../env';

describe('getProvider', () => {
  test.each`
    chainID             | URI
    ${ChainId.None}     | ${ETHEREUM_URI}
    ${ChainId.Arbitrum} | ${ARBITRUM_URI}
    ${ChainId.Ethereum} | ${ETHEREUM_URI}
    ${ChainId.Ropsten}  | ${ROPSTEN_URI}
    ${12345}            | ${ETHEREUM_URI}
  `('returns JsonRpcProvider instance for chainId: $chainID', async ({ chainID, URI }) => {
    // when / act
    const provider = getProvider(chainID);
    const jsonProvider = new ethers.providers.JsonRpcProvider(URI);
    // then / assert
    expect(provider).toMatchObject(jsonProvider);
  });
});
