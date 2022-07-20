import { getProvider, getBlockNumber } from './utils';
import { ethers } from 'ethers';
import { ChainId } from '../../constants';

import { ARBITRUM_URI, ARBITRUM_RINKEBY_URI, ETHERUM_URI, ROPSTEN_URI } from '../../env';

describe('getProvider', () => {
  test.each`
    chainID                     | URI
    ${ChainId.None}             | ${ETHERUM_URI}
    ${ChainId.Arbitrum}         | ${ARBITRUM_URI}
    ${ChainId.Ethereum}         | ${ETHERUM_URI}
    ${ChainId.Ropsten}          | ${ROPSTEN_URI}
    ${ChainId.Arbitrum_Rinkeby} | ${ARBITRUM_RINKEBY_URI}
    ${12345}                    | ${ETHERUM_URI}
  `('returns JsonRpcProvider instance for chainId: $chainID', async ({ chainID, URI }) => {
    // when / act
    const provider = getProvider(chainID);
    const jsonProvider = new ethers.providers.JsonRpcProvider(URI);
    // then / assert
    expect(provider).toMatchObject(jsonProvider);
  });
});
