import type { Job } from 'bullmq';

import { clock } from '../../core/time/clock';
import { logger } from '../../core/logging/logger';
import {
  DEAD_LETTER_CAPTURE_JOB_NAME,
  type DeadLetterEnvelope
} from '../dlq/deadLetterPolicy';
import { getQueues } from '..';
import { buildJobId } from '../jobId';
import type { CorrelatedJobData } from './withWorkerContext';

export interface FailedJobEventSource<TData> {
  on(
    event: 'failed',
    listener: (job: Job<CorrelatedJobData<TData>> | undefined, error: Error) => Promise<void>
  ): unknown;
}

interface DeadLetterLogger {
  warn: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
}

export interface DeadLetterHandlerDependencies {
  enqueue: (envelope: DeadLetterEnvelope) => Promise<void>;
  log: DeadLetterLogger;
}

const defaultDependencies: DeadLetterHandlerDependencies = {
  enqueue: async (envelope) => {
    await getQueues().deadLetterQueue.add(DEAD_LETTER_CAPTURE_JOB_NAME, envelope, {
      jobId: buildJobId('dead-letter', envelope.queueName, envelope.jobId, envelope.failedAt)
    });
  },
  log: logger
};

function toSerializablePayload(payload: unknown): unknown {
  if (payload === undefined) {
    return {
      unavailable: true
    };
  }

  try {
    return JSON.parse(JSON.stringify(payload)) as unknown;
  } catch {
    return {
      serializationError: 'payload_not_serializable'
    };
  }
}

function extractCorrelationId(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const correlationId = (payload as Record<string, unknown>).correlationId;
  return typeof correlationId === 'string' ? correlationId : undefined;
}

async function routeFailedJobToDeadLetter<TData>(
  job: Job<CorrelatedJobData<TData>> | undefined,
  error: Error,
  queueName: string,
  dependencies: DeadLetterHandlerDependencies
): Promise<void> {
  if (!job) {
    dependencies.log.error(
      {
        queue: queueName,
        err: error
      },
      'worker-job-failed-without-job-instance'
    );
    return;
  }

  const configuredAttempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  if (job.attemptsMade < configuredAttempts) {
    dependencies.log.warn(
      {
        queue: queueName,
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        attemptsConfigured: configuredAttempts,
        err: error
      },
      'worker-job-failed-retry-scheduled'
    );
    return;
  }

  const correlationId = extractCorrelationId(job.data);
  const envelope: DeadLetterEnvelope = {
    queueName,
    jobId: job.id ?? 'unknown',
    payload: toSerializablePayload(job.data),
    errorMessage: error.message,
    stack: error.stack,
    failedAt: clock.now().toISOString(),
    correlationId
  };
  await dependencies.enqueue(envelope);

  dependencies.log.error(
    {
      queue: queueName,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      correlationId,
      deadLetterJobId: buildJobId('dead-letter', queueName, job.id ?? 'unknown'),
      err: error
    },
    'worker-job-routed-to-dead-letter'
  );
}

export function registerDeadLetterHandler<TData>(
  worker: FailedJobEventSource<TData>,
  queueName: string,
  dependencies: DeadLetterHandlerDependencies = defaultDependencies
): void {
  worker.on('failed', async (job, error) => {
    try {
      await routeFailedJobToDeadLetter(job, error, queueName, dependencies);
    } catch (routeError) {
      dependencies.log.error(
        {
          queue: queueName,
          jobId: job?.id,
          err: routeError
        },
        'worker-dead-letter-routing-failed'
      );
    }
  });
}
