import { prisma } from '../db/client';
import { logger } from '../core/logging/logger';
import { installFatalProcessHandlers } from '../core/process/fatalHandlers';
import { redisConnection } from '../queues/redis';
import { createCallAllocationWorker } from '../queues/workers/callAllocationWorker';
import { createCallValidationWorker } from '../queues/workers/callValidationWorker';
import { createDeadLetterWorker } from '../queues/workers/deadLetterWorker';
import { createDocumentationWorker } from '../queues/workers/documentationWorker';
import { createEnrichmentWorker } from '../queues/workers/enrichmentWorker';
import { createGoogleSheetsSyncWorker } from '../queues/workers/googleSheetsSyncWorker';
import { createSupabaseSyncWorker } from '../queues/workers/supabaseSyncWorker';
import { createApolloLeadSourcingWorker } from '../queues/workers/apolloLeadSourcingWorker';
import { createJobTitleDiscoveryWorker } from '../queues/workers/jobTitleDiscoveryWorker';
import { createLeadIngestionWorker } from '../queues/workers/leadIngestionWorker';
import { createOutreachWorker } from '../queues/workers/outreachWorker';
import { createPerformanceWorker } from '../queues/workers/performanceWorker';
import { createRankingWorker } from '../queues/workers/rankingWorker';
import { createSalesNavIngestionWorker } from '../queues/workers/salesNavIngestionWorker';
import { createScreeningWorker } from '../queues/workers/screeningWorker';
import { createYayCallEventsWorker } from '../queues/workers/yayCallEventsWorker';
import { registerWorkerEventEmitter } from '../queues/workers/workerEventEmitter';
import { QUEUE_NAMES } from '../queues/definitions/queueNames';

const yayWorker = createYayCallEventsWorker();
const callAllocationWorker = createCallAllocationWorker();
const callValidationWorker = createCallValidationWorker();
const enrichmentWorker = createEnrichmentWorker();
const outreachWorker = createOutreachWorker();
const apolloLeadSourcingWorker = createApolloLeadSourcingWorker();
const salesNavIngestionWorker = createSalesNavIngestionWorker();
const leadIngestionWorker = createLeadIngestionWorker();
const jobTitleDiscoveryWorker = createJobTitleDiscoveryWorker();
const rankingWorker = createRankingWorker();
const performanceWorker = createPerformanceWorker();
const googleSheetsSyncWorker = createGoogleSheetsSyncWorker();
const supabaseSyncWorker = createSupabaseSyncWorker();
const screeningWorker = createScreeningWorker();
const documentationWorker = createDocumentationWorker();
const deadLetterWorker = createDeadLetterWorker();

registerWorkerEventEmitter(yayWorker, QUEUE_NAMES.YAY_CALL_EVENTS);
registerWorkerEventEmitter(callAllocationWorker, QUEUE_NAMES.CALL_ALLOCATION);
registerWorkerEventEmitter(callValidationWorker, QUEUE_NAMES.CALL_VALIDATION);
registerWorkerEventEmitter(enrichmentWorker, QUEUE_NAMES.ENRICHMENT);
registerWorkerEventEmitter(outreachWorker, QUEUE_NAMES.OUTREACH);
registerWorkerEventEmitter(apolloLeadSourcingWorker, QUEUE_NAMES.APOLLO_LEAD_SOURCING);
registerWorkerEventEmitter(salesNavIngestionWorker, QUEUE_NAMES.SALES_NAV_INGESTION);
registerWorkerEventEmitter(leadIngestionWorker, QUEUE_NAMES.LEAD_INGESTION);
registerWorkerEventEmitter(jobTitleDiscoveryWorker, QUEUE_NAMES.JOB_TITLE_DISCOVERY);
registerWorkerEventEmitter(rankingWorker, QUEUE_NAMES.RANKING);
registerWorkerEventEmitter(performanceWorker, QUEUE_NAMES.PERFORMANCE);
registerWorkerEventEmitter(googleSheetsSyncWorker, QUEUE_NAMES.GOOGLE_SHEETS_SYNC);
registerWorkerEventEmitter(supabaseSyncWorker, QUEUE_NAMES.SUPABASE_SYNC);
registerWorkerEventEmitter(screeningWorker, QUEUE_NAMES.SCREENING);
registerWorkerEventEmitter(documentationWorker, QUEUE_NAMES.DOCUMENTATION);
registerWorkerEventEmitter(deadLetterWorker, QUEUE_NAMES.DEAD_LETTER);

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('worker shutdown initiated');

  await Promise.all([
    yayWorker.close(),
    callAllocationWorker.close(),
    callValidationWorker.close(),
    enrichmentWorker.close(),
    outreachWorker.close(),
    apolloLeadSourcingWorker.close(),
    salesNavIngestionWorker.close(),
    leadIngestionWorker.close(),
    jobTitleDiscoveryWorker.close(),
    rankingWorker.close(),
    performanceWorker.close(),
    googleSheetsSyncWorker.close(),
    supabaseSyncWorker.close(),
    screeningWorker.close(),
    documentationWorker.close(),
    deadLetterWorker.close()
  ]);
  await redisConnection.quit();
  await prisma.$disconnect();
  logger.info('worker shutdown completed');
}

async function onSignal(signal: NodeJS.Signals): Promise<void> {
  try {
    await shutdown();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error, signal }, 'failed during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void onSignal('SIGTERM');
});

process.on('SIGINT', () => {
  void onSignal('SIGINT');
});

installFatalProcessHandlers({
  logger,
  onFatalError: async () => {
    await shutdown();
  }
});

logger.info('workers started');
