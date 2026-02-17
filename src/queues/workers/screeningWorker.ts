import { Worker } from 'bullmq';

import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { ScreeningService } from '../../modules/screening/screeningService';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

const screeningFollowUpSchema = z.object({
  projectId: z.string().uuid(),
  expertId: z.string().uuid()
});

type ScreeningFollowUpJob = z.infer<typeof screeningFollowUpSchema>;

const screeningService = new ScreeningService(prisma);

export function createScreeningWorker(): Worker<CorrelatedJobData<ScreeningFollowUpJob>> {
  const worker = new Worker<CorrelatedJobData<ScreeningFollowUpJob>>(
    QUEUE_NAMES.SCREENING,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = screeningFollowUpSchema.parse(job.data.data);
      await screeningService.processFollowUp(payload.projectId, payload.expertId);
      jobLogger.info(payload, 'screening-followup-processed');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 10
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.SCREENING);
  return worker;
}
