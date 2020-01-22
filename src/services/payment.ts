import { IScheduled, Status } from '../models/Models';
import Scheduled from '../models/ScheduledSchema';

const PAYMENT_ADDRESSES = (process.env.PAYMENT_ADDRESSES || '').split(',');

export interface IPaymentService {
  //   getNextPaymentAddress(): Promise<string>;
  //   getPendingPayment(): Promise<IScheduled[]>;
}

export class PaymentService implements IPaymentService {
  public static getNextPaymentAddress() {
    PaymentService.currentAddressIndex =
      PaymentService.currentAddressIndex >= PAYMENT_ADDRESSES.length
        ? 0
        : PaymentService.currentAddressIndex++;

    return PAYMENT_ADDRESSES[PaymentService.currentAddressIndex];
  }

  private static currentAddressIndex = 0;

  public static init(): void {}

  private getPendingPayment(): Promise<IScheduled[]> {
    return Scheduled.where('status', Status.PendingPayment).exec();
  }
}
