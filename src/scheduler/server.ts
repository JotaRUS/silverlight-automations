import { subDays } from './timeUtils';
import { AUTO_SOURCING, isoCodeToLocationName } from '../config/constants';
import { logger } from '../core/logging/logger';
import { installFatalProcessHandlers } from '../core/process/fatalHandlers';
import { clock } from '../core/time/clock';
import { prisma } from '../db/client';
import { DeadLetterJobRepository } from '../db/repositories/deadLetterJobRepository';
import { closeQueues, getQueues } from '../queues';
import { DEAD_LETTER_RETENTION_DAYS } from '../queues/dlq/deadLetterPolicy';
import { buildJobId } from '../queues/jobId';
import { enqueueWithContext } from '../queues/producers/enqueueWithContext';
import { emitNotification } from '../modules/notifications/emitNotification';
import { ProjectCompletionService } from '../modules/projects/projectCompletionService';
import { resolveTemplate, type TemplateContext } from '../modules/outreach/outreachService';
import { isChannelAvailableForProject } from '../modules/outreach/channelSelection';
import {
  extractApolloFiltersFromSalesNavSearch,
  mergeApolloSearchFilters
} from '../modules/sales-nav/salesNavSearchParamExtractor';
import type { Channel as PrismaChannel, Prisma } from '@prisma/client';
import { getSalesNavAccessToken } from '../integrations/sales-nav/salesNavOAuthClient';
import { listLeadFormResponses } from '../integrations/sales-nav/linkedInLeadSyncClient';
import { decryptProviderCredentials } from '../core/providers/providerCredentialsCrypto';

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

  const rankingJobsEnqueued = await computeRankingSnapshots();

  logger.info(
    {
      archivedCount,
      cutoff: cutoff.toISOString(),
      performanceJobsEnqueued: activeCallers.length,
      callAllocationJobsEnqueued: activeCallers.length,
      screeningFollowupsEnqueued: pendingScreenings.length,
      signupChaseCandidates: signupChaseCandidates.length,
      rankingJobsEnqueued
    },
    'scheduler-maintenance-run-completed'
  );

  const nowMs = clock.now().getTime();
  if (nowMs - lastAutoSourcingRunMs >= AUTO_SOURCING.INTERVAL_MS) {
    lastAutoSourcingRunMs = nowMs;
    await runAutoSourcingLoop();
    await pollLinkedInLeadResponses();
  }
}

const RANKING_STALE_MS = 60 * 60 * 1000;
const FRESH_REPLY_WINDOW_MS = 48 * 60 * 60 * 1000;

async function computeRankingSnapshots(): Promise<number> {
  await prisma.rankingSnapshot.deleteMany({
    where: { createdAt: { lt: new Date(clock.now().getTime() - RANKING_STALE_MS) } }
  });

  const activeProjects = await prisma.project.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true }
  });

  if (activeProjects.length === 0) return 0;

  const timeSlice = clock.now().toISOString().slice(0, 16);
  const freshReplyCutoff = new Date(clock.now().getTime() - FRESH_REPLY_WINDOW_MS);
  let enqueued = 0;

  for (const project of activeProjects) {
    const leads = await prisma.lead.findMany({
      where: {
        projectId: project.id,
        expertId: { not: null },
        deletedAt: null,
        status: { notIn: ['DISQUALIFIED'] }
      },
      select: { expertId: true }
    });

    const expertIds = [...new Set(leads.map((l) => l.expertId).filter(Boolean))] as string[];
    if (expertIds.length === 0) continue;

    const phoneContacts = await prisma.expertContact.findMany({
      where: { expertId: { in: expertIds }, type: 'PHONE', deletedAt: null },
      select: { expertId: true },
      distinct: ['expertId']
    });
    const callableExpertIds = new Set(phoneContacts.map((c) => c.expertId));
    if (callableExpertIds.size === 0) continue;

    const freshReplies = await prisma.outreachThread.findMany({
      where: {
        projectId: project.id,
        expertId: { in: [...callableExpertIds] },
        replied: true,
        updatedAt: { gte: freshReplyCutoff }
      },
      select: { expertId: true },
      distinct: ['expertId']
    });
    const freshReplyExpertIds = new Set(freshReplies.map((t) => t.expertId));

    const freshScreenings = await prisma.screeningResponse.findMany({
      where: {
        projectId: project.id,
        expertId: { in: [...callableExpertIds] },
        updatedAt: { gte: freshReplyCutoff }
      },
      select: { expertId: true },
      distinct: ['expertId']
    });
    for (const sr of freshScreenings) {
      if (sr.expertId) freshReplyExpertIds.add(sr.expertId);
    }

    const signupChases = await prisma.callTask.findMany({
      where: {
        projectId: project.id,
        expertId: { in: [...callableExpertIds] },
        status: 'COMPLETED',
        callOutcome: 'INTERESTED_SIGNUP_LINK_SENT'
      },
      select: { expertId: true },
      distinct: ['expertId']
    });
    const signupChaseExpertIds = new Set(signupChases.map((t) => t.expertId));

    const rejections = await prisma.callTask.findMany({
      where: {
        projectId: project.id,
        expertId: { in: [...callableExpertIds] },
        status: 'COMPLETED',
        callOutcome: 'RETRYABLE_REJECTION'
      },
      select: { expertId: true },
      distinct: ['expertId']
    });
    const rejectionExpertIds = new Set(rejections.map((t) => t.expertId));

    for (const expertId of callableExpertIds) {
      await getQueues().rankingQueue.add(
        'ranking.compute',
        {
          correlationId: 'scheduler',
          data: {
            projectId: project.id,
            expertId,
            freshReplyBoost: freshReplyExpertIds.has(expertId),
            signupChaseBoost: signupChaseExpertIds.has(expertId),
            highValueRejectionBoost: rejectionExpertIds.has(expertId)
          }
        },
        {
          jobId: buildJobId('ranking', project.id, expertId, timeSlice)
        }
      );
      enqueued += 1;
    }
  }

  return enqueued;
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

interface SalesNavSyncMetadata {
  webhookSubscriptionId?: string;
  lastResponsePolledAt?: string;
  syncedLeadFormIds?: string[];
  processedResponseIds?: string[];
}

async function pollLinkedInLeadResponses(): Promise<void> {
  const salesNavAccounts = await prisma.providerAccount.findMany({
    where: {
      providerType: 'SALES_NAV_WEBHOOK',
      isActive: true,
      lastHealthStatus: { notIn: ['out_of_credits'] }
    }
  });

  let totalEnqueued = 0;

  for (const account of salesNavAccounts) {
    try {
      let credentials: Record<string, unknown>;
      try {
        credentials = decryptProviderCredentials(account.credentialsJson);
      } catch {
        continue;
      }

      const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : '';
      const clientSecret = typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';
      const organizationId = typeof credentials.organizationId === 'string' ? credentials.organizationId : '';
      if (!clientId || !clientSecret || !organizationId) continue;

      const syncMeta = (account.syncMetadata as SalesNavSyncMetadata | null) ?? {};
      const processedIds = new Set(syncMeta.processedResponseIds ?? []);

      const defaultLookbackMs = 10 * 60 * 1000;
      const since = syncMeta.lastResponsePolledAt
        ? new Date(syncMeta.lastResponsePolledAt).getTime()
        : clock.now().getTime() - defaultLookbackMs;

      const token = await getSalesNavAccessToken(clientId, clientSecret);
      const responses = await listLeadFormResponses(token, organizationId, 'SPONSORED', {
        start: since,
        end: clock.now().getTime()
      });

      let enqueued = 0;
      for (const formResponse of responses.elements) {
        if (formResponse.testLead) continue;
        if (processedIds.has(formResponse.id)) continue;

        await enqueueWithContext(
          getQueues().salesNavIngestionQueue,
          'linkedin-lead-sync.fetch-response',
          {
            providerAccountId: account.id,
            responseId: formResponse.id,
            organizationId,
            leadType: formResponse.leadType
          },
          {
            jobId: buildJobId('li-lead-sync', account.id, formResponse.id)
          }
        );
        enqueued += 1;
      }

      await prisma.providerAccount.update({
        where: { id: account.id },
        data: {
          syncMetadata: {
            ...syncMeta,
            lastResponsePolledAt: clock.now().toISOString()
          } as Prisma.InputJsonValue
        }
      });

      totalEnqueued += enqueued;

      if (enqueued > 0) {
        logger.info(
          { accountId: account.id, enqueued },
          'linkedin-poll-leads-enqueued'
        );
      }
    } catch (error) {
      logger.error({ err: error, accountId: account.id }, 'linkedin-poll-failed');
    }
  }

  if (totalEnqueued > 0 || salesNavAccounts.length > 0) {
    logger.info(
      { accountsChecked: salesNavAccounts.length, totalEnqueued },
      'linkedin-poll-cycle-completed'
    );
  }
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
          firstName: lead.firstName ?? undefined,
          lastName: lead.lastName ?? undefined,
          fullName: lead.fullName ?? undefined,
          companyName,
          jobTitle: lead.jobTitle ?? undefined,
          linkedinUrl: lead.linkedinUrl ?? undefined,
          countryIso:
            lead.countryIso?.length === 2 ? lead.countryIso : undefined,
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

const OUTREACH_CHANNELS: PrismaChannel[] = [
  'EMAIL', 'SMS', 'VOICEMAIL', 'WHATSAPP', 'RESPONDIO',
  'LINE', 'WECHAT', 'VIBER', 'TELEGRAM', 'KAKAOTALK'
];

async function queuePendingOutreach(
  projectId: string,
  _projectName: string,
  timeSlice: string
): Promise<number> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { outreachMessageTemplate: true }
  });

  const template = (project as Record<string, unknown> | null)?.outreachMessageTemplate;
  if (typeof template !== 'string' || !template.trim()) {
    return 0;
  }

  const availableChannels: PrismaChannel[] = [];
  for (const ch of OUTREACH_CHANNELS) {
    if (await isChannelAvailableForProject(prisma, projectId, ch)) {
      availableChannels.push(ch);
    }
  }
  if (availableChannels.length === 0) return 0;

  const enrichedLeads = await prisma.lead.findMany({
    where: {
      projectId,
      status: 'ENRICHED',
      expertId: { not: null },
      deletedAt: null
    },
    take: AUTO_SOURCING.OUTREACH_BATCH_SIZE,
    select: {
      id: true, expertId: true, firstName: true, lastName: true,
      jobTitle: true, countryIso: true, metadata: true
    }
  });

  let queued = 0;
  for (const lead of enrichedLeads) {
    if (!lead.expertId) continue;

    const existingThread = await prisma.outreachThread.findFirst({
      where: { projectId, expertId: lead.expertId },
      select: { id: true }
    });
    if (existingThread) continue;

    const expert = await prisma.expert.findUnique({
      where: { id: lead.expertId },
      select: { currentCompany: true, countryIso: true }
    });

    const meta = (lead.metadata as Record<string, unknown> | null) ?? {};
    const countryIso = lead.countryIso ?? expert?.countryIso;
    const countryName = countryIso ? isoCodeToLocationName(countryIso) : (meta.country as string | undefined) ?? null;

    const context: TemplateContext = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      country: countryName || null,
      jobTitle: lead.jobTitle,
      currentCompany: expert?.currentCompany ?? (meta.companyName as string | undefined) ?? null
    };

    const body = resolveTemplate(template, context);
    if (!body) continue;

    const contacts = await prisma.expertContact.findMany({
      where: { expertId: lead.expertId, deletedAt: null },
      select: { type: true, value: true }
    });

    let didQueue = false;
    for (const channel of availableChannels) {
      let recipient: string | undefined;
      if (channel === 'EMAIL') {
        recipient = contacts.find((c) => c.type === 'EMAIL')?.value;
      } else if (channel === 'SMS' || channel === 'VOICEMAIL' || channel === 'WHATSAPP') {
        recipient = contacts.find((c) => c.type === 'PHONE')?.value;
      } else {
        recipient = contacts.find((c) => c.type === 'PHONE')?.value ?? contacts.find((c) => c.type === 'EMAIL')?.value;
      }
      if (!recipient) continue;

      await getQueues().outreachQueue.add(
        'outreach.auto-send',
        {
          correlationId: 'scheduler',
          data: {
            projectId,
            expertId: lead.expertId,
            channel,
            recipient,
            body,
            overrideCooldown: false
          }
        },
        {
          jobId: buildJobId('outreach', projectId, lead.expertId, channel, timeSlice)
        }
      );
      didQueue = true;
    }

    if (didQueue) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'OUTREACH_PENDING' }
      });
      queued += 1;
    }
  }

  if (queued > 0) {
    const completionService = new ProjectCompletionService(prisma);
    await completionService.recalculate(projectId);
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

  const activeLeadCount = await prisma.lead.count({
    where: {
      projectId: project.id,
      status: { not: 'DISQUALIFIED' },
      deletedAt: null
    }
  });
  if (activeLeadCount >= project.targetThreshold) {
    return 0;
  }

  const pipelineCount = await prisma.lead.count({
    where: {
      projectId: project.id,
      status: { in: ['NEW', 'ENRICHING', 'ENRICHED', 'OUTREACH_PENDING'] },
      deletedAt: null
    }
  });

  const remainingSlots = project.targetThreshold - activeLeadCount;
  if (remainingSlots <= 0 || pipelineCount >= remainingSlots) {
    return 0;
  }

  const locations = project.geographyIsoCodes.length > 0
    ? project.geographyIsoCodes.map(isoCodeToLocationName)
    : undefined;

  const jobTitles = await prisma.jobTitle.findMany({
    where: { projectId: project.id },
    orderBy: { relevanceScore: 'desc' },
    take: 10,
    select: { titleNormalized: true }
  });
  const companies = await prisma.company.findMany({
    where: { projectId: project.id, deletedAt: null },
    orderBy: { name: 'asc' },
    take: 25,
    select: { name: true }
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

  const leadsNeeded = Math.max(1, remainingSlots - pipelineCount);
  const perPage = Math.min(leadsNeeded, 25);
  const maxPages = Math.min(Math.ceil(leadsNeeded / perPage), 3);

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
        organizationNames: mergeUniqueStringValues(
          companies.map((company) => company.name),
          salesNavFilters.organizationNames
        ),
        organizationLocations: salesNavFilters.organizationLocations,
        organizationNumEmployeesRanges: salesNavFilters.organizationNumEmployeesRanges,
        keywords: salesNavFilters.keywords,
        maxPages,
        perPage
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
