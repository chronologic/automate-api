import Scheduled from '../models/ScheduledSchema';
import { Status, IScheduleRequest, IScheduled } from '../models/Models';

export interface IScheduleService {
  schedule(request: IScheduleRequest);
  find(id: string);
  cancel(id: string);
  getPending(): Promise<IScheduled[]>;
}

export class ScheduleService implements IScheduleService {
  public schedule(request: IScheduleRequest) {
    const scheduled = new Scheduled(request);
    scheduled.status = Status.Pending;

    return scheduled.save();
  }

  public find(id: string) {
    return Scheduled.findById(id).exec();
  }

  public cancel(id: string) {
    return Scheduled.updateOne(
      { _id: id },
      { status: Status.Cancelled }
    ).exec();
  }

  public getPending(): Promise<IScheduled[]> {
    return Scheduled.where('status', Status.Pending).exec();
  }
}
