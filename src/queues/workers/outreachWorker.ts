import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { OutreachService } from '../../modules/outreach/outreachService';
import {
  outreachMessageJobSchema,
  type OutreachMessageJob
} from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { registerDeadLetterHandler } from './withDeadLetter';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';

const outreachService = new OutreachService(prisma);

export function createOutreachWorker(): Worker<CorrelatedJobData<OutreachMessageJob>> {
  const worker = new Worker<CorrelatedJobData<OutreachMessageJob>>(
    QUEUE_NAMES.OUTREACH,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = outreachMessageJobSchema.parse(job.data.data);
      const result = await outreachService.sendMessage(payload);
      jobLogger.info(
        {
          threadId: result.threadId,
          messageId: result.messageId
        },
        'outreach-message-dispatched'
      );
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 8
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.OUTREACH);
  return worker;
}
