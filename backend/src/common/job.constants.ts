export const JOB_QUEUES = {
  REWARD_CALCULATION: 'reward-calculation',
  ACHIEVEMENT_CHECK: 'achievement-check',
  ANALYTICS_AGGREGATE: 'analytics-aggregate',
} as const;

export type JobQueueName = (typeof JOB_QUEUES)[keyof typeof JOB_QUEUES];

// DLQ-1107: a job is retried up to DLQ_MAX_RETRIES consecutive times. When it
// fails for the final time, the processor routes it to the dead-letter queue
// for manual inspection instead of silently dropping it.
export const DLQ_MAX_RETRIES = 5;
export const JOB_RETRY_ATTEMPTS = DLQ_MAX_RETRIES;
export const JOB_BACKOFF_DELAY_MS = 1000;
export const JOB_BACKOFF_TYPE = 'exponential' as const;

export const DEAD_LETTER_QUEUE = 'dead-letter-queue';
export const DLQ_TTL_MS = 24 * 60 * 60 * 1000;
