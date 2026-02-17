import { Queue } from 'bullmq';

import { namespacedRedisKey } from '../core/redis/namespace';
import { bullMqConnection } from './redis';
import { QUEUE_NAMES, type QueueName } from './definitions/queueNames';

function createQueue(name: QueueName): Queue {
  return new Queue(namespacedRedisKey(name), {
    connection: bullMqConnection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: false,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  });
}

export const queues = {
  jobTitleDiscoveryQueue: createQueue(QUEUE_NAMES.JOB_TITLE_DISCOVERY),
  salesNavIngestionQueue: createQueue(QUEUE_NAMES.SALES_NAV_INGESTION),
  leadIngestionQueue: createQueue(QUEUE_NAMES.LEAD_INGESTION),
  enrichmentQueue: createQueue(QUEUE_NAMES.ENRICHMENT),
  outreachQueue: createQueue(QUEUE_NAMES.OUTREACH),
  screeningQueue: createQueue(QUEUE_NAMES.SCREENING),
  callAllocationQueue: createQueue(QUEUE_NAMES.CALL_ALLOCATION),
  callValidationQueue: createQueue(QUEUE_NAMES.CALL_VALIDATION),
  performanceQueue: createQueue(QUEUE_NAMES.PERFORMANCE),
  rankingQueue: createQueue(QUEUE_NAMES.RANKING),
  googleSheetsSyncQueue: createQueue(QUEUE_NAMES.GOOGLE_SHEETS_SYNC),
  documentationQueue: createQueue(QUEUE_NAMES.DOCUMENTATION),
  yayCallEventsQueue: createQueue(QUEUE_NAMES.YAY_CALL_EVENTS),
  deadLetterQueue: createQueue(QUEUE_NAMES.DEAD_LETTER)
};

export async function closeQueues(): Promise<void> {
  await Promise.all(Object.values(queues).map(async (queue) => queue.close()));
}
