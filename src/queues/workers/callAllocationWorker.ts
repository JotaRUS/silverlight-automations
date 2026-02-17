import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { CallAllocationService } from '../../modules/call-allocation/callAllocationService';
import {
  callAllocationJobSchema,
  type CallAllocationJob
} from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { registerDeadLetterHandler } from './withDeadLetter';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';

const callAllocationService = new CallAllocationService(prisma);

export function createCallAllocationWorker(): Worker<CorrelatedJobData<CallAllocationJob>> {
  const worker = new Worker<CorrelatedJobData<CallAllocationJob>>(
    QUEUE_NAMES.CALL_ALLOCATION,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = callAllocationJobSchema.parse(job.data.data);
      const task = await callAllocationService.fetchOrAssignCurrentTask(payload.callerId);
      jobLogger.info(
        {
          callerId: payload.callerId,
          taskId: task?.id ?? null
        },
        'call-allocation-job-processed'
      );
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 10
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.CALL_ALLOCATION);
  return worker;
}
