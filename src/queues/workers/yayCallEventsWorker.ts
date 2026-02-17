import { Worker } from 'bullmq';

import { env } from '../../config/env';
import type { YayWebhookEvent } from '../../integrations/yay/types';
import { getQueues } from '..';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { buildJobId } from '../jobId';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

export function createYayCallEventsWorker(): Worker<CorrelatedJobData<YayWebhookEvent>> {
  const worker = new Worker<CorrelatedJobData<YayWebhookEvent>>(
    QUEUE_NAMES.YAY_CALL_EVENTS,
    async (job) => {
      const jobLogger = createJobLogger(job);
      await getQueues().callValidationQueue.add(
        'call-validation.process-yay',
        {
          correlationId: job.data.correlationId,
          data: {
            event: job.data.data
          }
        },
        {
          jobId: buildJobId('call-validation', job.data.data.event_id),
          removeOnFail: false
        }
      );
      jobLogger.info(
        {
          eventId: job.data.data.event_id,
          eventType: job.data.data.event_type
        },
        'yay-event-forwarded-to-call-validation'
      );
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
