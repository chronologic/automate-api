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

    test.each`
      status
      ${Status.Cancelled}
      ${Status.Completed}
      ${Status.StaleNonce}
      ${Status.PendingConfirmations}
      ${Status.PendingPayment}
      ${Status.PendingPaymentConfirmations}
      ${Status.PaymentExpired}
    `('returns non Error & Draft status as it is', ({ status }) => {
      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: false,
        isStrategyTx: false,
        isProxyRequest,
      });
      //  then / assert
      expect(newStatus).toBe(status);
    });

    // status.pending
  });

  describe('proxy request', () => {
    const isProxyRequest = true;

    test.each`
      status
      ${Status.Pending}
      ${Status.Cancelled}
      ${Status.Completed}
      ${Status.Error}
      ${Status.StaleNonce}
      ${Status.PendingConfirmations}
      ${Status.PendingPayment}
      ${Status.PendingPaymentConfirmations}
      ${Status.PaymentExpired}
      ${Status.Draft}
    `('returns current status for Draft, non Strategy tx having status $status', ({ status }: { status: Status }) => {
      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: true,
        isStrategyTx: false,
        isProxyRequest,
      });
      //  then / assert
      expect(newStatus).toBe(status);
    });

    test.each`
      status
      ${Status.Pending}
      ${Status.Cancelled}
      ${Status.Completed}
      ${Status.Error}
      ${Status.StaleNonce}
      ${Status.PendingConfirmations}
      ${Status.PendingPayment}
      ${Status.PendingPaymentConfirmations}
      ${Status.PaymentExpired}
      ${Status.Draft}
    `('returns current status for Draft, Strategy tx having status $status', ({ status }) => {
      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: true,
        isStrategyTx: true,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(status);
    });

    test.each`
      status
      ${Status.Pending}
      ${Status.Cancelled}
      ${Status.Completed}
      ${Status.Error}
      ${Status.StaleNonce}
      ${Status.PendingConfirmations}
      ${Status.PendingPayment}
      ${Status.PendingPaymentConfirmations}
      ${Status.PaymentExpired}
      ${Status.Draft}
    `('returns current status for Non Draft, Strategy tx having status $status', ({ status }) => {
      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: false,
        isStrategyTx: true,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(status);
    });

    test.each`
      status
      ${Status.Pending}
      ${Status.Cancelled}
      ${Status.Completed}
      ${Status.Error}
      ${Status.StaleNonce}
      ${Status.PendingConfirmations}
      ${Status.PendingPayment}
      ${Status.PendingPaymentConfirmations}
      ${Status.PaymentExpired}
      ${Status.Draft}
    `('returns current stauts for Non Draft, Non Strategy tx having status $status', ({ status }) => {
      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: false,
        isStrategyTx: false,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(status);
    });
  });
});
