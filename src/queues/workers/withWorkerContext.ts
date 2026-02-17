import type { Job } from 'bullmq';

import { logger } from '../../core/logging/logger';

export interface CorrelatedJobData<TData> {
  correlationId: string;
  data: TData;
}

export function getJobCorrelationId<TData>(job: Job<CorrelatedJobData<TData>>): string {
  return job.data.correlationId;
}

export function createJobLogger<TData>(
  job: Job<CorrelatedJobData<TData>>
): ReturnType<typeof logger.child> {
  return logger.child({
    correlationId: getJobCorrelationId(job),
    queue: job.queueName,
    jobId: job.id,
    jobName: job.name
  });
}
