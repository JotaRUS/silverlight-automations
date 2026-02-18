import type { JobsOptions, Queue } from 'bullmq';

import { getRequestContext } from '../../core/http/requestContext';

export interface CorrelatedJobPayload<TData> {
  correlationId: string;
  data: TData;
}

export async function enqueueWithContext(
  queue: Queue,
  jobName: string,
  data: unknown,
  options?: JobsOptions
): Promise<void> {
  const correlationId = getRequestContext()?.correlationId ?? 'system';
  await queue.add(
    jobName,
    {
      correlationId,
      data
    } satisfies CorrelatedJobPayload<unknown>,
    options
  );
}
