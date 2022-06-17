import { Status } from '../models/Models';
import { calculateNewStatus } from './schedule';

describe('calculateNewStatus', () => {
  describe('direct request', () => {
    const isProxyRequest = false;

    test('changes Error status back to Pending', () => {
      // given / arrange
      const status = Status.Error;

      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: false,
        isStrategyTx: false,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(Status.Pending);
    });
  });
});
