import type { Job } from 'bull';
import { RewardCalculationProcessor } from './reward-calculation.processor';
import { DlqService } from '../dlq.service';
import { RewardJobData } from '../job.service';
import { DLQ_MAX_RETRIES } from '../job.constants';

describe('RewardCalculationProcessor', () => {
  let processor: RewardCalculationProcessor;
  let dlqService: { maybeSendToDeadLetter: jest.Mock };

  const rewardData: RewardJobData = {
    sessionId: 'session-1',
    playerId: 'player-1',
    outcome: 'won',
    dayId: 1,
  };

  beforeEach(() => {
    dlqService = {
      maybeSendToDeadLetter: jest.fn().mockResolvedValue(undefined),
    };
    processor = new RewardCalculationProcessor(
      dlqService as unknown as DlqService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('routes an exhausted job to the DLQ when it fails', async () => {
    const job = {
      id: 1,
      attemptsMade: DLQ_MAX_RETRIES,
      data: rewardData,
    } as unknown as Job<RewardJobData>;

    await processor.onFailed(job, new Error('boom'));

    expect(dlqService.maybeSendToDeadLetter).toHaveBeenCalledWith(job);
  });

  it('delegates the retry-budget decision to DlqService', async () => {
    const job = {
      id: 2,
      attemptsMade: 2,
      data: rewardData,
    } as unknown as Job<RewardJobData>;

    await processor.onFailed(job, new Error('transient'));

    expect(dlqService.maybeSendToDeadLetter).toHaveBeenCalledWith(job);
  });
});
