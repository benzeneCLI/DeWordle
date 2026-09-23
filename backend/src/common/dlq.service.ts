import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { DEAD_LETTER_QUEUE, DLQ_MAX_RETRIES } from './job.constants';

export interface DeadLetterError {
  name: string;
  message: string;
  stack?: string;
}

export interface DeadLetterRecord {
  /** Queue the original job was processed on. */
  originalQueue: string;
  /** Id of the failed source job. */
  sourceJobId: string | number;
  /** Original job payload retained for manual reprocessing. */
  payload: Record<string, unknown>;
  /** Number of consecutive failed attempts before routing. */
  attemptsMade: number;
  error: DeadLetterError;
  failedAt: string;
}

export interface DeadLetterInspection {
  id: string | number;
  name: string;
  attemptsMade: number;
  timestamp: number;
  data: DeadLetterRecord;
}

/**
 * DLQ-1107: dead-letter queue routing and inspection.
 *
 * Jobs that exhaust their retry budget are enqueued on the
 * `dead-letter-queue` Bull channel with their original payload and the final
 * error (message + stack trace) so operators can inspect and reprocess them.
 */
@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectQueue(DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue<DeadLetterRecord>,
  ) {}

  /**
   * Routes the job to the dead-letter queue once it exceeds the retry budget.
   * Jobs below the threshold are left to their normal lifecycle.
   */
  async maybeSendToDeadLetter(
    job: Job,
    maxRetries: number = DLQ_MAX_RETRIES,
  ): Promise<void> {
    if (job.attemptsMade < maxRetries) {
      return;
    }
    await this.sendToDeadLetter(job);
  }

  /** Enqueues an inspection record for a failed job. */
  async sendToDeadLetter(job: Job): Promise<void> {
    const firstStackFrame = Array.isArray(job.stacktrace)
      ? job.stacktrace.find(
          (entry: unknown): entry is string => typeof entry === 'string',
        )
      : undefined;

    const record: DeadLetterRecord = {
      originalQueue: job.queue.name,
      sourceJobId: job.id,
      payload: (job.data ?? {}) as Record<string, unknown>,
      attemptsMade: job.attemptsMade,
      error: {
        name: 'JobFailed',
        message: job.failedReason ?? 'Processing failed without a reason',
        stack: firstStackFrame ?? undefined,
      },
      failedAt: new Date().toISOString(),
    };

    await this.deadLetterQueue.add('inspect', record, {
      removeOnComplete: true,
    });

    const reason = record.error.message;
    this.logger.error(
      `Job ${job.id} routed to ${DEAD_LETTER_QUEUE} after ${job.attemptsMade} consecutive failures (source=${job.queue.name}): ${reason}`,
    );
  }

  /** Returns dead-letter records waiting for manual inspection. */
  async listDeadLetterJobs(limit = 100): Promise<DeadLetterInspection[]> {
    const jobs = await this.deadLetterQueue.getWaiting(0, limit);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      data: job.data,
    }));
  }

  /** Number of records currently sitting in the dead-letter queue. */
  async getDeadLetterCount(): Promise<number> {
    return this.deadLetterQueue.getWaitingCount();
  }
}
