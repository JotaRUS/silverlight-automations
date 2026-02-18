import { subDays } from './timeUtils';
import { logger } from '../core/logging/logger';
import { installFatalProcessHandlers } from '../core/process/fatalHandlers';
import { clock } from '../core/time/clock';
import { prisma } from '../db/client';
import { DeadLetterJobRepository } from '../db/repositories/deadLetterJobRepository';
import { closeQueues, getQueues } from '../queues';
import { DEAD_LETTER_RETENTION_DAYS } from '../queues/dlq/deadLetterPolicy';
import { buildJobId } from '../queues/jobId';

const deadLetterRepository = new DeadLetterJobRepository(prisma);
const SCHEDULER_INTERVAL_MS = 60 * 1000;

let schedulerHandle: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;
let activeCyclePromise: Promise<void> | null = null;

async function runScheduledMaintenance(): Promise<void> {
  const cutoff = subDays(clock.now(), DEAD_LETTER_RETENTION_DAYS);
  const archivedCount = await deadLetterRepository.archiveOlderThan(cutoff);

  const activeCallers = await prisma.caller.findMany({
    where: {
      allocationStatus: {
        in: ['ACTIVE', 'WARMUP_GRACE', 'AT_RISK', 'PAUSED_LOW_DIAL_RATE']
      }
    },
    select: { id: true }
  });
  await Promise.all(
    activeCallers.map(async (caller) =>
      getQueues().performanceQueue.add(
        'performance.recalculate',
        {
          correlationId: 'scheduler',
          data: {
            callerId: caller.id
          }
        },
        {
          jobId: buildJobId(
            'performance',
            caller.id,
            clock.now().toISOString().slice(0, 16)
          )
        }
      )
    )
  );
  await Promise.all(
    activeCallers.map(async (caller) =>
      getQueues().callAllocationQueue.add(
        'call-allocation.assign-current',
        {
          correlationId: 'scheduler',
          data: {
            callerId: caller.id
          }
        },
        {
          jobId: buildJobId(
            'call-allocation',
            caller.id,
            clock.now().toISOString().slice(0, 16)
          )
        }
      )
    )
  );

  const pendingScreenings = await prisma.screeningResponse.findMany({
    where: {
      status: {
        in: ['PENDING', 'IN_PROGRESS']
      },
      updatedAt: {
        lte: new Date(clock.now().getTime() - 15 * 60 * 1000)
      }
    },
    select: {
      projectId: true,
      expertId: true
    }
  });

  await Promise.all(
    pendingScreenings.map(async (item) =>
      getQueues().screeningQueue.add(
        'screening.followup',
        {
          correlationId: 'scheduler',
          data: {
            projectId: item.projectId,
            expertId: item.expertId
          }
        },
        {
          jobId: buildJobId(
            'screening-followup',
            item.projectId,
            item.expertId,
            clock.now().toISOString().slice(0, 13)
          )
        }
      )
    )
  );

  const signupChaseCandidates = await prisma.callTask.findMany({
    where: {
      status: 'COMPLETED',
      callOutcome: 'INTERESTED_SIGNUP_LINK_SENT',
      updatedAt: {
        lte: new Date(clock.now().getTime() - 24 * 60 * 60 * 1000)
      }
    }
  });

  const dayStart = new Date(clock.now().toISOString().slice(0, 10));
  for (const task of signupChaseCandidates) {
    const todayCallAttempts = await prisma.callTask.count({
      where: {
        expertId: task.expertId,
        createdAt: {
          gte: dayStart
        }
      }
    });
    if (todayCallAttempts >= 3) {
      continue;
    }

    await prisma.callTask.create({
      data: {
        projectId: task.projectId,
        expertId: task.expertId,
        status: 'PENDING',
        priorityScore: task.priorityScore
      }
    });
  }

  logger.info(
    {
      archivedCount,
      cutoff: cutoff.toISOString(),
      performanceJobsEnqueued: activeCallers.length,
      callAllocationJobsEnqueued: activeCallers.length,
      screeningFollowupsEnqueued: pendingScreenings.length,
      signupChaseCandidates: signupChaseCandidates.length
    },
    'scheduler-maintenance-run-completed'
  );
}

async function shutdown(): Promise<void> {
  stopping = true;
  if (schedulerHandle) {
    clearTimeout(schedulerHandle);
    schedulerHandle = undefined;
  }
  if (activeCyclePromise) {
    await activeCyclePromise;
  }
  await closeQueues();
  await prisma.$disconnect();
  logger.info('scheduler shutdown complete');
}

async function onSignal(signal: NodeJS.Signals): Promise<void> {
  try {
    await shutdown();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error, signal }, 'failed during scheduler shutdown');
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

function scheduleNext(): void {
  if (stopping) return;
  schedulerHandle = setTimeout(() => {
    activeCyclePromise = runMaintenanceCycle();
  }, SCHEDULER_INTERVAL_MS);
}

async function runMaintenanceCycle(): Promise<void> {
  if (running || stopping) return;
  running = true;
  try {
    await runScheduledMaintenance();
  } catch (error) {
    logger.error({ err: error }, 'scheduler-maintenance-run-failed');
  } finally {
    running = false;
    scheduleNext();
  }
}

activeCyclePromise = runMaintenanceCycle();
logger.info('scheduler started');
