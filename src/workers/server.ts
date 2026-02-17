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
import { createJobTitleDiscoveryWorker } from '../queues/workers/jobTitleDiscoveryWorker';
import { createLeadIngestionWorker } from '../queues/workers/leadIngestionWorker';
import { createOutreachWorker } from '../queues/workers/outreachWorker';
import { createPerformanceWorker } from '../queues/workers/performanceWorker';
import { createRankingWorker } from '../queues/workers/rankingWorker';
import { createSalesNavIngestionWorker } from '../queues/workers/salesNavIngestionWorker';
import { createScreeningWorker } from '../queues/workers/screeningWorker';
import { createYayCallEventsWorker } from '../queues/workers/yayCallEventsWorker';

const yayWorker = createYayCallEventsWorker();
const callAllocationWorker = createCallAllocationWorker();
const callValidationWorker = createCallValidationWorker();
const enrichmentWorker = createEnrichmentWorker();
const outreachWorker = createOutreachWorker();
const salesNavIngestionWorker = createSalesNavIngestionWorker();
const leadIngestionWorker = createLeadIngestionWorker();
const jobTitleDiscoveryWorker = createJobTitleDiscoveryWorker();
const rankingWorker = createRankingWorker();
const performanceWorker = createPerformanceWorker();
const googleSheetsSyncWorker = createGoogleSheetsSyncWorker();
const screeningWorker = createScreeningWorker();
const documentationWorker = createDocumentationWorker();
const deadLetterWorker = createDeadLetterWorker();

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
    salesNavIngestionWorker.close(),
    leadIngestionWorker.close(),
    jobTitleDiscoveryWorker.close(),
    rankingWorker.close(),
    performanceWorker.close(),
    googleSheetsSyncWorker.close(),
    screeningWorker.close(),
    documentationWorker.close(),
    deadLetterWorker.close()
  ]);
  await redisConnection.quit();
  await prisma.$disconnect();
  logger.info('worker shutdown completed');
}

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});

installFatalProcessHandlers({
  logger,
  onFatalError: async () => {
    await shutdown();
  }
});

logger.info('workers started');
