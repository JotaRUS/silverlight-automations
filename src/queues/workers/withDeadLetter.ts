import type { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';

import { logger } from '../../core/logging/logger';
import { prisma } from '../../db/client';
import { DeadLetterJobRepository } from '../../db/repositories/deadLetterJobRepository';
import type { CorrelatedJobData } from './withWorkerContext';

const deadLetterRepository = new DeadLetterJobRepository(prisma);

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

interface DeadLetterHandlerDependencies {
  repository: Pick<DeadLetterJobRepository, 'create'>;
  log: DeadLetterLogger;
}

const defaultDependencies: DeadLetterHandlerDependencies = {
  repository: deadLetterRepository,
  log: logger
};

function toJsonPayload(payload: unknown): Prisma.InputJsonValue {
  if (payload === undefined) {
    return {
      unavailable: true
    };
  }

  try {
    return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
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
  await dependencies.repository.create({
    queueName,
    jobId: job.id ?? 'unknown',
    payload: toJsonPayload(job.data),
    errorMessage: error.message,
    stackTrace: error.stack,
    correlationId
  });

  dependencies.log.error(
    {
      queue: queueName,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      correlationId,
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
