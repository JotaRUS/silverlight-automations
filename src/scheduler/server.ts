import { subDays } from './timeUtils';
import { logger } from '../core/logging/logger';
import { clock } from '../core/time/clock';
import { prisma } from '../db/client';
import { DeadLetterJobRepository } from '../db/repositories/deadLetterJobRepository';

const deadLetterRepository = new DeadLetterJobRepository(prisma);
const DLQ_ARCHIVE_AFTER_DAYS = 30;
const SCHEDULER_INTERVAL_MS = 60 * 1000;

let schedulerHandle: NodeJS.Timeout | undefined;

async function runScheduledMaintenance(): Promise<void> {
  const cutoff = subDays(clock.now(), DLQ_ARCHIVE_AFTER_DAYS);
  const archivedCount = await deadLetterRepository.archiveOlderThan(cutoff);
  logger.info({ archivedCount, cutoff: cutoff.toISOString() }, 'dlq-archival-run-completed');
}

async function shutdown(): Promise<void> {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = undefined;
  }
  await prisma.$disconnect();
  logger.info('scheduler shutdown complete');
}

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});

schedulerHandle = setInterval(() => {
  void runScheduledMaintenance();
}, SCHEDULER_INTERVAL_MS);

void runScheduledMaintenance();
logger.info('scheduler started');
