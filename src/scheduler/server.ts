import { subDays } from './timeUtils';
import { logger } from '../core/logging/logger';
import { installFatalProcessHandlers } from '../core/process/fatalHandlers';
import { clock } from '../core/time/clock';
import { prisma } from '../db/client';
import { DeadLetterJobRepository } from '../db/repositories/deadLetterJobRepository';
import { getQueues } from '../queues';
import { DEAD_LETTER_RETENTION_DAYS } from '../queues/dlq/deadLetterPolicy';
import { buildJobId } from '../queues/jobId';

const deadLetterRepository = new DeadLetterJobRepository(prisma);
const SCHEDULER_INTERVAL_MS = 60 * 1000;

let schedulerHandle: NodeJS.Timeout | undefined;

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
      screeningFollowupsEnqueued: pendingScreenings.length,
      signupChaseCandidates: signupChaseCandidates.length
    },
    'scheduler-maintenance-run-completed'
  );
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

installFatalProcessHandlers({
  logger,
  onFatalError: async () => {
    await shutdown();
  }
});

schedulerHandle = setInterval(() => {
  void runScheduledMaintenance();
}, SCHEDULER_INTERVAL_MS);

void runScheduledMaintenance();
logger.info('scheduler started');
