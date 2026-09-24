import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { JobMonitorController } from './job-monitor.controller';
import { JobService } from './job.service';
import { DlqService } from './dlq.service';
import { RewardCalculationProcessor } from './processors/reward-calculation.processor';
import { AchievementCheckProcessor } from './processors/achievement-check.processor';
import { AnalyticsAggregateProcessor } from './processors/analytics-aggregate.processor';
import { JOB_QUEUES, DEAD_LETTER_QUEUE } from './job.constants';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue(
      { name: JOB_QUEUES.REWARD_CALCULATION },
      { name: JOB_QUEUES.ACHIEVEMENT_CHECK },
      { name: JOB_QUEUES.ANALYTICS_AGGREGATE },
      { name: DEAD_LETTER_QUEUE },
    ),
  ],
  controllers: [JobMonitorController],
  providers: [
    JobService,
    DlqService,
    RewardCalculationProcessor,
    AchievementCheckProcessor,
    AnalyticsAggregateProcessor,
  ],
  exports: [JobService, DlqService, BullModule],
})
export class JobModule {}
