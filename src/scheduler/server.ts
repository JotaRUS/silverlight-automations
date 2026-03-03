import { subDays } from './timeUtils';
import { AUTO_SOURCING } from '../config/constants';
import { logger } from '../core/logging/logger';
import { installFatalProcessHandlers } from '../core/process/fatalHandlers';
import { clock } from '../core/time/clock';
import { prisma } from '../db/client';
import { DeadLetterJobRepository } from '../db/repositories/deadLetterJobRepository';
import { closeQueues, getQueues } from '../queues';
import { DEAD_LETTER_RETENTION_DAYS } from '../queues/dlq/deadLetterPolicy';
import { buildJobId } from '../queues/jobId';
import { emitNotification } from '../modules/notifications/emitNotification';
import {
  extractApolloFiltersFromSalesNavSearch,
  mergeApolloSearchFilters
} from '../modules/sales-nav/salesNavSearchParamExtractor';

const deadLetterRepository = new DeadLetterJobRepository(prisma);
const SCHEDULER_INTERVAL_MS = 60 * 1000;
let lastAutoSourcingRunMs = 0;

let schedulerHandle: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;
let activeCyclePromise: Promise<void> | null = null;

function mergeUniqueStringValues(...collections: (string[] | undefined)[]): string[] | undefined {
  const deduped = new Map<string, string>();
  for (const collection of collections) {
    if (!Array.isArray(collection)) {
      continue;
    }
    for (const item of collection) {
      const value = item.trim();
      if (!value) {
        continue;
      }
      const key = value.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, value);
      }
    }
  }
  return deduped.size > 0 ? Array.from(deduped.values()) : undefined;
}

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

  const nowMs = clock.now().getTime();
  if (nowMs - lastAutoSourcingRunMs >= AUTO_SOURCING.INTERVAL_MS) {
    lastAutoSourcingRunMs = nowMs;
    await runAutoSourcingLoop();
  }
}

async function runAutoSourcingLoop(): Promise<void> {
  const activeProjects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { priority: 'desc' }
  });
  const incompleteProjects = activeProjects.filter(
    (p) => p.signedUpCount < p.targetThreshold
  );

  if (incompleteProjects.length === 0) {
    return;
  }

  let totalEnrichmentQueued = 0;
  let totalOutreachQueued = 0;
  let totalStalledProjects = 0;
  let totalApolloSearchesQueued = 0;
  const timeSlice = clock.now().toISOString().slice(0, 13);

  for (const project of incompleteProjects) {
    const enrichmentQueued = await queuePendingEnrichment(project.id, timeSlice);
    totalEnrichmentQueued += enrichmentQueued;

    const outreachQueued = await queuePendingOutreach(project.id, project.name, timeSlice);
    totalOutreachQueued += outreachQueued;

    const apolloQueued = await queueApolloSourcingIfNeeded(project, timeSlice);
    totalApolloSearchesQueued += apolloQueued;

    const stalled = await detectStalledSourcing(project);
    if (stalled) {
      totalStalledProjects += 1;
    }
  }

  logger.info(
    {
      incompleteProjects: incompleteProjects.length,
      totalEnrichmentQueued,
      totalOutreachQueued,
      totalApolloSearchesQueued,
      totalStalledProjects
    },
    'auto-sourcing-loop-completed'
  );
}

async function queuePendingEnrichment(projectId: string, timeSlice: string): Promise<number> {
  const newLeads = await prisma.lead.findMany({
    where: {
      projectId,
      status: 'NEW',
      deletedAt: null
    },
    take: AUTO_SOURCING.ENRICHMENT_BATCH_SIZE
  });

  for (const lead of newLeads) {
    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const companyName = typeof metadata.companyName === 'string' ? metadata.companyName : undefined;
    const emails = Array.isArray(metadata.emails)
      ? (metadata.emails as unknown[]).filter((e): e is string => typeof e === 'string')
      : [];
    const phones = Array.isArray(metadata.phones)
      ? (metadata.phones as unknown[]).filter((p): p is string => typeof p === 'string')
      : [];

    await getQueues().enrichmentQueue.add(
      'enrichment.run',
      {
        correlationId: 'scheduler',
        data: {
          leadId: lead.id,
          projectId,
          fullName: lead.fullName ?? undefined,
          companyName,
          linkedinUrl: lead.linkedinUrl ?? undefined,
          countryIso:
            lead.countryIso && lead.countryIso.length === 2 ? lead.countryIso : undefined,
          emails,
          phones
        }
      },
      {
        jobId: buildJobId('enrichment', lead.id, timeSlice)
      }
    );
  }

  return newLeads.length;
}

async function queuePendingOutreach(
  projectId: string,
  projectName: string,
  timeSlice: string
): Promise<number> {
  const enrichedLeads = await prisma.lead.findMany({
    where: {
      projectId,
      status: 'ENRICHED',
      expertId: { not: null },
      deletedAt: null
    },
    take: AUTO_SOURCING.OUTREACH_BATCH_SIZE
  });

  let queued = 0;
  for (const lead of enrichedLeads) {
    if (!lead.expertId) {
      continue;
    }

    const existingThread = await prisma.outreachThread.findFirst({
      where: {
        projectId,
        expertId: lead.expertId
      },
      select: { id: true }
    });
    if (existingThread) {
      continue;
    }

    const contact = await prisma.expertContact.findFirst({
      where: {
        expertId: lead.expertId,
        verificationStatus: 'VERIFIED',
        type: { in: ['EMAIL', 'PHONE'] },
        deletedAt: null
      },
      orderBy: { type: 'asc' }
    });
    if (!contact) {
      continue;
    }

    const channel = contact.type === 'EMAIL' ? 'EMAIL' : 'PHONE';

    await getQueues().outreachQueue.add(
      'outreach.send',
      {
        correlationId: 'scheduler',
        data: {
          projectId,
          expertId: lead.expertId,
          channel,
          recipient: contact.value,
          body: `Invitation to participate as an expert in ${projectName}. We believe your expertise would be valuable for this project.`,
          overrideCooldown: false
        }
      },
      {
        jobId: buildJobId('outreach', projectId, lead.expertId, timeSlice)
      }
    );

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'OUTREACH_PENDING' }
    });

    queued += 1;
  }

  return queued;
}

async function queueApolloSourcingIfNeeded(
  project: {
    id: string;
    targetThreshold: number;
    apolloProviderAccountId: string | null;
    geographyIsoCodes: string[];
  },
  timeSlice: string
): Promise<number> {
  if (!project.apolloProviderAccountId) {
    return 0;
  }

  const totalLeadCount = await prisma.lead.count({
    where: { projectId: project.id, deletedAt: null }
  });
  const leadCap = Math.max(project.targetThreshold * 5, AUTO_SOURCING.ENRICHMENT_BATCH_SIZE);
  if (totalLeadCount >= leadCap) {
    return 0;
  }

  const pipelineCount = await prisma.lead.count({
    where: {
      projectId: project.id,
      status: { in: ['NEW', 'ENRICHING', 'ENRICHED', 'OUTREACH_PENDING'] },
      deletedAt: null
    }
  });

  if (pipelineCount >= AUTO_SOURCING.ENRICHMENT_BATCH_SIZE) {
    return 0;
  }

  const locations = project.geographyIsoCodes.length > 0
    ? project.geographyIsoCodes
    : undefined;

  const jobTitles = await prisma.jobTitle.findMany({
    where: { projectId: project.id },
    orderBy: { relevanceScore: 'desc' },
    take: 10,
    select: { titleNormalized: true }
  });
  const activeSalesNavSearches = await prisma.salesNavSearch.findMany({
    where: {
      projectId: project.id,
      isActive: true,
      deletedAt: null
    },
    select: {
      sourceUrl: true,
      normalizedUrl: true,
      metadata: true
    },
    take: 200
  });
  const salesNavFilters = mergeApolloSearchFilters(
    activeSalesNavSearches.map((search) =>
      extractApolloFiltersFromSalesNavSearch({
        sourceUrl: search.sourceUrl,
        normalizedUrl: search.normalizedUrl,
        metadata: (search.metadata as Record<string, unknown> | null) ?? undefined
      })
    )
  );
  const personLocations = mergeUniqueStringValues(locations, salesNavFilters.personLocations);
  const personTitles = mergeUniqueStringValues(
    jobTitles.map((jt) => jt.titleNormalized),
    salesNavFilters.personTitles
  );

  await getQueues().apolloLeadSourcingQueue.add(
    'apollo-lead-sourcing.search',
    {
      correlationId: 'scheduler',
      data: {
        projectId: project.id,
        personLocations,
        personTitles,
        personSeniorities: salesNavFilters.personSeniorities,
        personDepartments: salesNavFilters.personDepartments,
        personFunctions: salesNavFilters.personFunctions,
        personNotTitles: salesNavFilters.personNotTitles,
        personSkills: salesNavFilters.personSkills,
        organizationDomains: salesNavFilters.organizationDomains,
        organizationNames: salesNavFilters.organizationNames,
        organizationLocations: salesNavFilters.organizationLocations,
        organizationNumEmployeesRanges: salesNavFilters.organizationNumEmployeesRanges,
        keywords: salesNavFilters.keywords,
        maxPages: 2,
        perPage: 25
      }
    },
    {
      jobId: buildJobId('apollo-sourcing', project.id, timeSlice)
    }
  );

  return 1;
}

async function detectStalledSourcing(project: {
  id: string;
  name: string;
  signedUpCount: number;
  targetThreshold: number;
  apolloProviderAccountId: string | null;
  geographyIsoCodes: string[];
}): Promise<boolean> {
  const pipelineCount = await prisma.lead.count({
    where: {
      projectId: project.id,
      status: { in: ['NEW', 'ENRICHING', 'ENRICHED', 'OUTREACH_PENDING'] },
      deletedAt: null
    }
  });

  if (pipelineCount > 0) {
    return false;
  }

  const staleCutoff = new Date(
    clock.now().getTime() - AUTO_SOURCING.STALE_PIPELINE_HOURS * 60 * 60 * 1000
  );
  const recentLeadCount = await prisma.lead.count({
    where: {
      projectId: project.id,
      createdAt: { gte: staleCutoff },
      deletedAt: null
    }
  });

  if (recentLeadCount > 0) {
    return false;
  }

  const activeSources = await prisma.salesNavSearch.count({
    where: {
      projectId: project.id,
      isActive: true,
      deletedAt: null
    }
  });

  if (activeSources === 0 && !project.apolloProviderAccountId) {
    return false;
  }

  await prisma.systemEvent.create({
    data: {
      category: 'SYSTEM',
      entityType: 'project',
      entityId: project.id,
      message: 'auto_sourcing_pipeline_stalled',
      payload: {
        projectId: project.id,
        projectName: project.name,
        signedUpCount: project.signedUpCount,
        targetThreshold: project.targetThreshold,
        activeSources,
        reason:
          'No leads in pipeline and no recent ingestion. Triggering Apollo sourcing.'
      }
    }
  });

  emitNotification({
    type: 'project.stalled',
    severity: 'WARNING',
    title: `Sourcing stalled: ${project.name}`,
    message: `No leads in pipeline, ${project.signedUpCount}/${project.targetThreshold} signed up. Re-triggering Apollo.`,
    projectId: project.id,
    metadata: { activeSources, signedUpCount: project.signedUpCount, targetThreshold: project.targetThreshold }
  });

  if (project.apolloProviderAccountId) {
    const timeSlice = clock.now().toISOString().slice(0, 13);
    await queueApolloSourcingIfNeeded(project, `${timeSlice}-stalled`);
  }

  return true;
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
