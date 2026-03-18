import { Queue } from 'bullmq';

import { env } from '../config/env';
import { bullMqConnection } from './redis';
import { QUEUE_NAMES, type QueueName } from './definitions/queueNames';

function createQueue(name: QueueName): Queue {
  return new Queue(name, {
    connection: bullMqConnection,
    prefix: env.REDIS_NAMESPACE,
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

interface QueueRegistry {
  jobTitleDiscoveryQueue: Queue;
  apolloLeadSourcingQueue: Queue;
  salesNavIngestionQueue: Queue;
  salesNavScraperQueue: Queue;
  leadIngestionQueue: Queue;
  enrichmentQueue: Queue;
  outreachQueue: Queue;
  screeningQueue: Queue;
  callAllocationQueue: Queue;
  callValidationQueue: Queue;
  performanceQueue: Queue;
  rankingQueue: Queue;
  googleSheetsSyncQueue: Queue;
  supabaseSyncQueue: Queue;
  documentationQueue: Queue;
  yayCallEventsQueue: Queue;
  deadLetterQueue: Queue;
}

let queueRegistry: QueueRegistry | null = null;

export function getQueues(): QueueRegistry {
  if (queueRegistry) {
    return queueRegistry;
  }

  queueRegistry = {
    jobTitleDiscoveryQueue: createQueue(QUEUE_NAMES.JOB_TITLE_DISCOVERY),
    apolloLeadSourcingQueue: createQueue(QUEUE_NAMES.APOLLO_LEAD_SOURCING),
    salesNavIngestionQueue: createQueue(QUEUE_NAMES.SALES_NAV_INGESTION),
    salesNavScraperQueue: createQueue(QUEUE_NAMES.SALES_NAV_SCRAPER),
    leadIngestionQueue: createQueue(QUEUE_NAMES.LEAD_INGESTION),
    enrichmentQueue: createQueue(QUEUE_NAMES.ENRICHMENT),
    outreachQueue: createQueue(QUEUE_NAMES.OUTREACH),
    screeningQueue: createQueue(QUEUE_NAMES.SCREENING),
    callAllocationQueue: createQueue(QUEUE_NAMES.CALL_ALLOCATION),
    callValidationQueue: createQueue(QUEUE_NAMES.CALL_VALIDATION),
    performanceQueue: createQueue(QUEUE_NAMES.PERFORMANCE),
    rankingQueue: createQueue(QUEUE_NAMES.RANKING),
    googleSheetsSyncQueue: createQueue(QUEUE_NAMES.GOOGLE_SHEETS_SYNC),
    supabaseSyncQueue: createQueue(QUEUE_NAMES.SUPABASE_SYNC),
    documentationQueue: createQueue(QUEUE_NAMES.DOCUMENTATION),
    yayCallEventsQueue: createQueue(QUEUE_NAMES.YAY_CALL_EVENTS),
    deadLetterQueue: createQueue(QUEUE_NAMES.DEAD_LETTER)
  };

  return queueRegistry;
}

export async function closeQueues(): Promise<void> {
  if (!queueRegistry) {
    return;
  }
  const queueList: Queue[] = [
    queueRegistry.jobTitleDiscoveryQueue,
    queueRegistry.apolloLeadSourcingQueue,
    queueRegistry.salesNavIngestionQueue,
    queueRegistry.salesNavScraperQueue,
    queueRegistry.leadIngestionQueue,
    queueRegistry.enrichmentQueue,
    queueRegistry.outreachQueue,
    queueRegistry.screeningQueue,
    queueRegistry.callAllocationQueue,
    queueRegistry.callValidationQueue,
    queueRegistry.performanceQueue,
    queueRegistry.rankingQueue,
    queueRegistry.googleSheetsSyncQueue,
    queueRegistry.supabaseSyncQueue,
    queueRegistry.documentationQueue,
    queueRegistry.yayCallEventsQueue,
    queueRegistry.deadLetterQueue
  ];
  await Promise.all(queueList.map((queue) => queue.close()));
  queueRegistry = null;
}
