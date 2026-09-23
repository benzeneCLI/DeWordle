import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AnalyticsJobData } from '../job.service';
import { DlqService } from '../dlq.service';
import { JOB_QUEUES } from '../job.constants';

@Processor(JOB_QUEUES.ANALYTICS_AGGREGATE)
export class AnalyticsAggregateProcessor {
  private readonly logger = new Logger(AnalyticsAggregateProcessor.name);

  constructor(private readonly dlqService: DlqService) {}

  @Process('aggregate')
  async handleAggregate(job: Job<AnalyticsJobData>) {
    this.logger.debug(`Processing analytics aggregate for day ${job.data.dayId}`);

    const { dayId, aggregateType } = job.data;

    this.logger.log(
      `Analytics aggregated: day=${dayId}, type=${aggregateType}`,
    );

    return { dayId, aggregateType, aggregated: true };
  }

  @OnQueueFailed()
  async onFailed(job: Job<AnalyticsJobData>, error: Error) {
    this.logger.error(
      `Analytics aggregate job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    await this.dlqService.maybeSendToDeadLetter(job);
  }
}
