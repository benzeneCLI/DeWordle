import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { RewardJobData } from '../job.service';
import { DlqService } from '../dlq.service';
import { JOB_QUEUES } from '../job.constants';

@Processor(JOB_QUEUES.REWARD_CALCULATION)
export class RewardCalculationProcessor {
  private readonly logger = new Logger(RewardCalculationProcessor.name);

  constructor(private readonly dlqService: DlqService) {}

  @Process('calculate')
  async handleCalculate(job: Job<RewardJobData>) {
    this.logger.debug(`Processing reward calculation for session ${job.data.sessionId}`);

    const { sessionId, playerId, outcome, dayId } = job.data;
    const points = outcome === 'won' ? 100 : 10;
    const reason = outcome === 'won' ? 'win' : 'participation';

    this.logger.log(
      `Reward calculated: ${points} points for player ${playerId} (reason: ${reason}, day: ${dayId})`,
    );

    return { sessionId, playerId, points, reason, dayId };
  }

  @OnQueueFailed()
  async onFailed(job: Job<RewardJobData>, error: Error) {
    this.logger.error(
      `Reward calculation job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    await this.dlqService.maybeSendToDeadLetter(job);
  }
}
