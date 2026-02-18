import type { Prisma } from '@prisma/client';
import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { logger } from '../../core/logging/logger';
import { prisma } from '../../db/client';
import { DeadLetterJobRepository } from '../../db/repositories/deadLetterJobRepository';
import {
  DEAD_LETTER_CAPTURE_JOB_NAME,
  type DeadLetterEnvelope
} from '../dlq/deadLetterPolicy';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';

const deadLetterRepository = new DeadLetterJobRepository(prisma);

function toJsonPayload(payload: unknown): Prisma.InputJsonValue {
  return payload as Prisma.InputJsonValue;
}

export async function persistDeadLetterEnvelope(
  envelope: DeadLetterEnvelope,
  repository: Pick<DeadLetterJobRepository, 'create'> = deadLetterRepository
): Promise<void> {
  await repository.create({
    queueName: envelope.queueName,
    jobId: envelope.jobId,
    payload: toJsonPayload(envelope.payload),
    errorMessage: envelope.errorMessage,
    stackTrace: envelope.stack,
    correlationId: envelope.correlationId
  });
}

export function createDeadLetterWorker(): Worker<DeadLetterEnvelope> {
  const worker = new Worker<DeadLetterEnvelope>(
    QUEUE_NAMES.DEAD_LETTER,
    async (job) => {
      if (job.name !== DEAD_LETTER_CAPTURE_JOB_NAME) {
        logger.warn(
          {
            queue: QUEUE_NAMES.DEAD_LETTER,
            jobId: job.id,
            jobName: job.name
          },
          'dead-letter-worker-unknown-job-name'
        );
        return;
      }

      await persistDeadLetterEnvelope(job.data);
      logger.info(
        {
          queue: QUEUE_NAMES.DEAD_LETTER,
          jobId: job.id,
          sourceQueue: job.data.queueName,
          sourceJobId: job.data.jobId,
          correlationId: job.data.correlationId
        },
        'dead-letter-job-persisted'
      );
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 2
    }
  );

  worker.on('failed', (job, error) => {
    logger.error(
      {
        queue: QUEUE_NAMES.DEAD_LETTER,
        jobId: job?.id,
        err: error
      },
      'dead-letter-worker-job-failed'
    );
  });

  return worker;
}
