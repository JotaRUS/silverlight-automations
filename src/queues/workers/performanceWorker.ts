import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { PerformanceService } from '../../modules/performance-engine/performanceService';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

const performanceService = new PerformanceService(prisma);

interface PerformanceJobPayload {
  callerId: string;
}

export function createPerformanceWorker(): Worker<CorrelatedJobData<PerformanceJobPayload>> {
  const worker = new Worker<CorrelatedJobData<PerformanceJobPayload>>(
    QUEUE_NAMES.PERFORMANCE,
    async (job) => {
      const jobLogger = createJobLogger(job);
      await performanceService.recalculateForCaller(job.data.data.callerId);
      jobLogger.info({ callerId: job.data.data.callerId }, 'performance-recalculated');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 5
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.PERFORMANCE);
  return worker;
}
