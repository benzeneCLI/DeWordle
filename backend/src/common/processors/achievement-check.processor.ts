import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AchievementJobData } from '../job.service';
import { DlqService } from '../dlq.service';
import { JOB_QUEUES } from '../job.constants';

@Processor(JOB_QUEUES.ACHIEVEMENT_CHECK)
export class AchievementCheckProcessor {
  private readonly logger = new Logger(AchievementCheckProcessor.name);

  constructor(private readonly dlqService: DlqService) {}

  @Process('check')
  async handleCheck(job: Job<AchievementJobData>) {
    this.logger.debug(`Processing achievement check for player ${job.data.playerId}`);

    const { playerId, metric, value } = job.data;

    this.logger.log(
      `Achievement check: player=${playerId}, metric=${metric}, value=${value}`,
    );

    return { playerId, metric, value, checked: true };
  }

  @OnQueueFailed()
  async onFailed(job: Job<AchievementJobData>, error: Error) {
    this.logger.error(
      `Achievement check job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    await this.dlqService.maybeSendToDeadLetter(job);
  }
}
