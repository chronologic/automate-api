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

  describe('direct request', () => {
    const isProxyRequest = false;

    test('changes Draft status to Pending for free tx', () => {
      // given / arrange
      const status = Status.Draft;

      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: true,
        isDraft: false,
        isStrategyTx: false,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(Status.Pending);
    });
  });

  describe('direct request', () => {
    const isProxyRequest = false;

    test('changes Draft status to Pending Payment for non free tx', () => {
      // given / arrange
      const status = Status.Draft;

      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: false,
        isStrategyTx: false,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(Status.PendingPayment);
    });
  });
});
