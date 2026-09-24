import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import type { Job } from 'bull';
import { DlqService, DeadLetterRecord } from './dlq.service';
import {
  DEAD_LETTER_QUEUE,
  DLQ_MAX_RETRIES,
} from './job.constants';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 42,
    name: 'calculate',
    queue: { name: 'reward-calculation' },
    data: { sessionId: 's1', playerId: 'p1', outcome: 'won', dayId: 1 },
    attemptsMade: 5,
    failedReason: 'Redis connect ECONNREFUSED',
    stacktrace: ['Error: Redis connect ECONNREFUSED\n    at connect ()'],
    timestamp: 1_700_000_000_000,
    ...overrides,
  } as unknown as Job;
}

describe('DlqService', () => {
  let service: DlqService;
  let deadLetterQueue: {
    add: jest.Mock;
    getWaiting: jest.Mock;
    getWaitingCount: jest.Mock;
  };

  beforeEach(async () => {
    deadLetterQueue = {
      add: jest.fn().mockResolvedValue({ id: 7 }),
      getWaiting: jest.fn().mockResolvedValue([makeJob()]),
      getWaitingCount: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        {
          provide: getQueueToken(DEAD_LETTER_QUEUE),
          useValue: deadLetterQueue,
        },
      ],
    }).compile();

    service = module.get(DlqService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('maybeSendToDeadLetter', () => {
    it('routes a job to the DLQ once it reaches the retry budget', async () => {
      const job = makeJob({ attemptsMade: DLQ_MAX_RETRIES });

      await service.maybeSendToDeadLetter(job);

      expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
    });

    it('leaves jobs below the retry budget untouched', async () => {
      const job = makeJob({ attemptsMade: DLQ_MAX_RETRIES - 1 });

      await service.maybeSendToDeadLetter(job);

      expect(deadLetterQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('sendToDeadLetter', () => {
    it('stores payload and error stack in the DLQ record', async () => {
      const job = makeJob();

      await service.sendToDeadLetter(job);

      const [jobName, record] = deadLetterQueue.add.mock.calls[0] as [
        string,
        DeadLetterRecord,
      ];
      expect(jobName).toBe('inspect');
      expect(record).toEqual({
        originalQueue: 'reward-calculation',
        sourceJobId: 42,
        payload: { sessionId: 's1', playerId: 'p1', outcome: 'won', dayId: 1 },
        attemptsMade: 5,
        error: {
          name: 'JobFailed',
          message: 'Redis connect ECONNREFUSED',
          stack: 'Error: Redis connect ECONNREFUSED\n    at connect ()',
        },
        failedAt: expect.any(String),
      });
    });

    it('falls back when the failed job carries no stack trace', async () => {
      const job = makeJob({ stacktrace: [] });

      await service.sendToDeadLetter(job);

      const [, record] = deadLetterQueue.add.mock.calls[0] as [
        string,
        DeadLetterRecord,
      ];
      expect(record.error.stack).toBeUndefined();
      expect(record.error.message).toBe('Redis connect ECONNREFUSED');
    });

    it('adds the record with remove-on-complete so consumed records are cleaned up', async () => {
      const job = makeJob();

      await service.sendToDeadLetter(job);

      expect(deadLetterQueue.add).toHaveBeenCalledWith(
        'inspect',
        expect.any(Object),
        { removeOnComplete: true },
      );
    });
  });

  describe('listDeadLetterJobs', () => {
    it('returns records waiting for manual inspection', async () => {
      expect(deadLetterQueue.getWaiting).toHaveBeenCalledWith(0, 100);

      const records = await service.listDeadLetterJobs();

      expect(records).toEqual([
        {
          id: 42,
          name: 'calculate',
          attemptsMade: 5,
          timestamp: 1_700_000_000_000,
          data: expect.objectContaining({ sourceJobId: 42 }),
        },
      ]);
    });
  });

  describe('getDeadLetterCount', () => {
    it('reports how many records are in the dead-letter queue', async () => {
      await expect(service.getDeadLetterCount()).resolves.toBe(1);
    });
  });
});
