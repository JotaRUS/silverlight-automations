import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { parseYayWebhookEvent } from '../../integrations/yay/eventParser';
import { YayEventProcessor } from '../../modules/call-validation/yayEventProcessor';
import {
  callValidationJobSchema,
  type CallValidationJob
} from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { registerDeadLetterHandler } from './withDeadLetter';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';

const yayEventProcessor = new YayEventProcessor(prisma);

export function createCallValidationWorker(): Worker<CorrelatedJobData<CallValidationJob>> {
  const worker = new Worker<CorrelatedJobData<CallValidationJob>>(
    QUEUE_NAMES.CALL_VALIDATION,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = callValidationJobSchema.parse(job.data.data);
      const event = parseYayWebhookEvent(payload.event);
      await yayEventProcessor.process(event, job.data.correlationId);
      jobLogger.info(
        {
          eventId: event.event_id,
          eventType: event.event_type
        },
        'call-validation-complete'
      );
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 15
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.CALL_VALIDATION);
  return worker;
}
