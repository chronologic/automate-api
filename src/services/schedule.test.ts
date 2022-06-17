import { Status } from '../models/Models';
import { calculateNewStatusForDirectRequest } from './schedule';

describe('calculateNewStatusForDirectRequest', () => {
  test('changes Error status back to Pending', () => {
    // given
    const status = Status.Error;

    // when
    const newStatus = calculateNewStatusForDirectRequest({ currentStatus: status, isFreeTx: false });

    // then
    expect(newStatus).toBe(Status.Pending);
  });
});
