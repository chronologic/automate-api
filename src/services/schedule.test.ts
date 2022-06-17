import { Status } from '../models/Models';
import { calculateNewStatus } from './schedule';

describe('calculateNewStatus', () => {
  describe('direct request', () => {
    const isProxyRequest = false;

    test('changes Error status back to Pending', () => {
      // given
      const status = Status.Error;

      // when
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: false,
        isStrategyTx: false,
        isProxyRequest,
      });

      // then
      expect(newStatus).toBe(Status.Pending);
    });
  });
});
