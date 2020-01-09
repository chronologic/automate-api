import { Query } from 'mongoose';
import { It, Mock, Times } from 'typemoq';

import { AssetType, IScheduled, Status } from '../../models/Models';
import { IScheduleService } from '../schedule';
import { Processor } from './processor';
import { ITransactionExecutor } from './transaction';

// tslint:disable-next-line:no-implicit-dependencies
describe('Processor', () => {
  const createScheduled = (conditionBlock: number = 0) => {
    const scheduled = Mock.ofType<IScheduled>();

    scheduled.setup(s => s.from).returns(() => 'Sender');
    scheduled.setup(s => s.chainId).returns(() => 1);
    scheduled.setup(s => s.conditionBlock).returns(() => conditionBlock);
    scheduled.setup(s => s._id).returns(() => 'id');

    return scheduled;
  };

  const createScheduledWithNonce = (nonce: number) => {
    const tx = createScheduled();
    tx.setup(s => s.update(It.isAny())).returns(
      () => Mock.ofType<Query<any>>().object,
    );

    tx.setup(s => s.nonce).returns(() => nonce);

    return tx.object;
  };

  const createScheduleService = (scheduled: IScheduled[]) => {
    const scheduleService = Mock.ofType<IScheduleService>();

    scheduleService
      .setup(s => s.getPending(AssetType.Ethereum))
      .returns(async () => scheduled);

    return scheduleService;
  };

  it('should update conditionBlock when condition met first time', async done => {
    const block = 1;
    const scheduled = createScheduled();

    scheduled
      .setup(s => s.update(It.isAny()))
      .callback((update: IScheduled) => {
        expect(update.conditionBlock).toBe(block);
        done();
      })
      .returns(() => Mock.ofType<Query<any>>().object);

    const scheduleService = createScheduleService([scheduled.object]);

    const transactionExecutor = Mock.ofType<ITransactionExecutor>();
    transactionExecutor
      .setup(s => s.execute(It.isAny(), It.isAnyNumber()))
      .returns(async () => ({
        status: Status.Pending,
      }));

    const processor = new Processor(
      scheduleService.object,
      transactionExecutor.object,
    );

    await processor.process(block);
  });

  it('should not update when condition met second time', async () => {
    const block = 1;
    const scheduled = createScheduled(block);

    scheduled
      .setup(s => s.update(It.isAny()))
      .returns(() => Mock.ofType<Query<any>>().object)
      .verifiable(Times.never());

    const scheduleService = createScheduleService([scheduled.object]);

    const transactionExecutor = Mock.ofType<ITransactionExecutor>();
    transactionExecutor
      .setup(s => s.execute(It.isAny(), It.isAnyNumber()))
      .returns(async () => ({
        status: Status.Pending,
      }));

    const processor = new Processor(
      scheduleService.object,
      transactionExecutor.object,
    );

    await processor.process(block);

    scheduled.verifyAll();
  });

  it('should update state and transaction hash when success', async done => {
    const block = 1;
    const transactionHash = '0x1234';
    const scheduled = createScheduled();

    scheduled
      .setup(s => s.update(It.isAny()))
      .callback((update: IScheduled) => {
        expect(update.status).toBe(Status.Completed);
        expect(update.transactionHash).toBe(transactionHash);

        done();
      })
      .returns(() => Mock.ofType<Query<any>>().object);

    const scheduleService = createScheduleService([scheduled.object]);

    const transactionExecutor = Mock.ofType<ITransactionExecutor>();
    transactionExecutor
      .setup(s => s.execute(It.isAny(), It.isAnyNumber()))
      .returns(async () => ({
        status: Status.Completed,
        transactionHash,
      }));

    const processor = new Processor(
      scheduleService.object,
      transactionExecutor.object,
    );

    await processor.process(block);
  });

  it('should execute transactions from lowest nonce', async () => {
    const block = 1;
    const transactionHash = '0x1234';
    const executionQueue = [];

    const tx1 = createScheduledWithNonce(10);
    const tx2 = createScheduledWithNonce(11);
    const tx3 = createScheduledWithNonce(12);

    const scheduleService = createScheduleService([tx3, tx1, tx2]);

    const transactionExecutor = Mock.ofType<ITransactionExecutor>();
    transactionExecutor
      .setup(s => s.execute(It.isAny(), It.isAnyNumber()))
      .callback((tx: IScheduled) => executionQueue.push(tx.nonce))
      .returns(async () => ({
        status: Status.Completed,
        transactionHash,
      }));

    const processor = new Processor(
      scheduleService.object,
      transactionExecutor.object,
    );

    await processor.process(block);

    expect(executionQueue[0]).toBe(tx1.nonce);
    expect(executionQueue[1]).toBe(tx2.nonce);
    expect(executionQueue[2]).toBe(tx3.nonce);
  });

  it('should break execution when previous tx is pending', async () => {
    const block = 1;
    const transactionHash = '0x1234';
    const executionQueue = [];

    const tx1 = createScheduledWithNonce(10);
    const tx2 = createScheduledWithNonce(11);
    const tx3 = createScheduledWithNonce(12);

    const scheduleService = createScheduleService([tx3, tx1, tx2]);

    const transactionExecutor = Mock.ofType<ITransactionExecutor>();
    transactionExecutor
      .setup(s => s.execute(tx1, It.isAnyNumber()))
      .callback((tx: IScheduled) => executionQueue.push(tx.nonce))
      .returns(async () => ({
        status: Status.Completed,
        transactionHash,
      }));

    transactionExecutor
      .setup(s => s.execute(tx2, It.isAnyNumber()))
      .callback((tx: IScheduled) => executionQueue.push(tx.nonce))
      .returns(async () => ({
        status: Status.Pending,
        transactionHash,
      }));

    const processor = new Processor(
      scheduleService.object,
      transactionExecutor.object,
    );

    await processor.process(block);

    expect(executionQueue[0]).toBe(tx1.nonce);
    expect(executionQueue[1]).toBe(tx2.nonce);
    expect(executionQueue[2]).toBe(undefined);
  });
});
