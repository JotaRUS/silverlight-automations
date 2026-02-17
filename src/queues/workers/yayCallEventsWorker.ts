import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import type { YayWebhookEvent } from '../../integrations/yay/types';
import { YayEventProcessor } from '../../modules/call-validation/yayEventProcessor';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

const yayEventProcessor = new YayEventProcessor(prisma);

export function createYayCallEventsWorker(): Worker<CorrelatedJobData<YayWebhookEvent>> {
  const worker = new Worker<CorrelatedJobData<YayWebhookEvent>>(
    QUEUE_NAMES.YAY_CALL_EVENTS,
    async (job) => {
      const jobLogger = createJobLogger(job);
      await yayEventProcessor.process(job.data.data, job.data.correlationId);
      jobLogger.info('yay-event-processed');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 20
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.YAY_CALL_EVENTS);
  return worker;
}
