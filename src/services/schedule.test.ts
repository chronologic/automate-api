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

  describe('direct request', () => {
    const isProxyRequest = false;

    test('returns non Error & Draft status as it is', () => {
      // given / arrange
      const status = Status.Cancelled; // all status besides Error & Draft

      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: false,
        isStrategyTx: false,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(Status.Cancelled);
    });
  });

  describe('proxy request', () => {
    const isProxyRequest = true;

    test('returns Draft for non Strategy tx', () => {
      // given / arrange
      const status = Status.Pending; // all status

      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: true,
        isStrategyTx: false,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(Status.Draft);
    });
  });

  describe('proxy request', () => {
    const isProxyRequest = true;

    test('returns Pending for Strategy tx', () => {
      // given / arrange
      const status = Status.Error; // all status

      // when / act
      const newStatus = calculateNewStatus({
        currentStatus: status,
        isFreeTx: false,
        isDraft: true, // can be false too
        isStrategyTx: true,
        isProxyRequest,
      });

      // then / assert
      expect(newStatus).toBe(Status.Error);
    });
  });
});
