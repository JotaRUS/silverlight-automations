import { Router } from 'express';
import { z } from 'zod';
import { LeadStatus, ThreadStatus, ScreeningStatus } from '@prisma/client';

import type { Channel as PrismaChannel } from '@prisma/client';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { isoCodeToLocationName } from '../../config/constants';
import { AppError } from '../../core/errors/appError';
import { publishRealtimeEvent } from '../../core/realtime/realtimePubSub';
import { prisma } from '../../db/client';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { redisConnection } from '../../queues/redis';
import { isChannelAvailableForProject } from '../outreach/channelSelection';
import { resolveTemplate, type TemplateContext } from '../outreach/outreachService';
import { ProjectCompletionService } from '../projects/projectCompletionService';
import { ScreeningService } from '../screening/screeningService';

const leadQuerySchema = z.object({
  projectId: z.string().uuid(),
  status: z.nativeEnum(LeadStatus).optional(),
  enrichmentStatus: z.nativeEnum(LeadStatus).optional(),
  cooldownBlocked: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});

const leadUpdateSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  fullName: z.string().min(1).optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  regionIso: z.string().optional(),
  countryIso: z.string().optional()
});

const leadIdParamsSchema = z.object({
  leadId: z.string().uuid()
});

const threadIdParamsSchema = z.object({
  threadId: z.string().uuid()
});

const threadUpdateSchema = z.object({
  status: z.nativeEnum(ThreadStatus)
});

const screeningActionParamsSchema = z.object({
  responseId: z.string().uuid()
});

const screeningUpdateSchema = z.object({
  status: z.nativeEnum(ScreeningStatus).optional(),
  responseText: z.string().optional(),
  score: z.number().min(0).max(10).optional(),
  qualified: z.boolean().optional()
});

const screeningService = new ScreeningService(prisma);

export const adminRoutes = Router();

adminRoutes.use(authenticate, authorize(['admin', 'ops']));

adminRoutes.get('/dashboard-stats', async (_request, response, next) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      projectCountNow,
      projectCountPrev,
      callerCountNow,
      callerCountPrev,
      activeTaskCount,
      recentEvents,
      hourlyTaskRows
    ] = await Promise.all([
      prisma.project.count({ where: { deletedAt: null } }),
      prisma.project.count({ where: { deletedAt: null, createdAt: { lt: sevenDaysAgo } } }),
      prisma.caller.count({ where: { deletedAt: null } }),
      prisma.caller.count({ where: { deletedAt: null, createdAt: { lt: sevenDaysAgo } } }),
      prisma.callTask.count({ where: { status: { in: ['ASSIGNED', 'DIALING'] } } }),
      prisma.systemEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc('hour', "createdAt") AS bucket, COUNT(*)::bigint AS count
        FROM "CallTask"
        WHERE "createdAt" >= ${twentyFourHoursAgo}
        GROUP BY bucket
        ORDER BY bucket ASC
      `
    ]);

    let systemHealth: 'healthy' | 'degraded' | 'down' = 'healthy';
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redisConnection.ping();
    } catch {
      systemHealth = 'degraded';
    }

    function trendPercent(current: number, previous: number): string | null {
      if (previous === 0) return current > 0 ? `+${current} new` : null;
      const delta = ((current - previous) / previous) * 100;
      const sign = delta >= 0 ? '+' : '';
      return `${sign}${delta.toFixed(1)}%`;
    }

    const hourlyTasks = hourlyTaskRows.map((row) => ({
      hour: row.bucket.toISOString(),
      count: Number(row.count)
    }));

    response.status(200).json({
      projectCount: projectCountNow,
      projectTrend: trendPercent(projectCountNow, projectCountPrev),
      callerCount: callerCountNow,
      callerTrend: trendPercent(callerCountNow, callerCountPrev),
      activeTaskCount,
      systemHealth,
      recentEvents,
      hourlyTasks
    });
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/leads', async (request, response, next) => {
  try {
    const query = leadQuerySchema.parse(request.query);
    const where: Record<string, unknown> = {
      projectId: query.projectId,
      status: query.status,
      deletedAt: null
    };

    const [total, statusCountRows, leads] = await Promise.all([
      prisma.lead.count({ where: where as never }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { projectId: query.projectId, deletedAt: null } as never,
        _count: true
      }),
      prisma.lead.findMany({
        where: where as never,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          expert: {
            include: {
              contacts: { where: { deletedAt: null } }
            }
          },
          enrichmentAttempts: {
            orderBy: {
              attemptedAt: 'desc'
            },
            take: 5
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of statusCountRows) {
      statusCounts[row.status] = row._count;
    }

    const leadIds = leads.map((lead) => lead.id);
    const cooldownByExpert = new Map<string, number>();
    if (query.cooldownBlocked) {
      const cooldownLogs = await prisma.cooldownLog.findMany({
        where: {
          expertId: {
            in: leads.map((lead) => lead.expertId).filter((value): value is string => Boolean(value))
          },
          expiresAt: {
            gt: new Date()
          }
        }
      });
      for (const log of cooldownLogs) {
        cooldownByExpert.set(log.expertId, (cooldownByExpert.get(log.expertId) ?? 0) + 1);
      }
    }

    const filteredLeads = leads.filter((lead) => {
      if (query.enrichmentStatus && lead.status !== query.enrichmentStatus) {
        return false;
      }
      if (query.cooldownBlocked === 'true') {
        return Boolean(lead.expertId && cooldownByExpert.has(lead.expertId));
      }
      if (query.cooldownBlocked === 'false') {
        return !lead.expertId || !cooldownByExpert.has(lead.expertId);
      }
      return true;
    });

    response.status(200).json({
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
      statusCounts,
      leadIds,
      leads: filteredLeads
    });
  } catch (error) {
    next(error);
  }
});

adminRoutes.patch('/leads/:leadId', async (request, response, next) => {
  try {
    const params = leadIdParamsSchema.parse(request.params);
    const body = leadUpdateSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', body.error.flatten());
    }
    const existing = await prisma.lead.findUnique({ where: { id: params.leadId } });
    if (!existing || existing.deletedAt) {
      throw new AppError('Lead not found', 404, 'lead_not_found');
    }
    const updated = await prisma.lead.update({
      where: { id: params.leadId },
      data: body.data,
      include: { project: { select: { id: true, name: true } } }
    });

    if (body.data.status && existing.projectId) {
      const completionService = new ProjectCompletionService(prisma);
      await completionService.recalculate(existing.projectId);
    }

    response.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

adminRoutes.delete('/leads/:leadId', async (request, response, next) => {
  try {
    const params = leadIdParamsSchema.parse(request.params);
    const existing = await prisma.lead.findUnique({ where: { id: params.leadId } });
    if (!existing || existing.deletedAt) {
      throw new AppError('Lead not found', 404, 'lead_not_found');
    }
    await prisma.lead.update({
      where: { id: params.leadId },
      data: { deletedAt: new Date() }
    });
    response.status(200).json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/outreach/threads', async (request, response, next) => {
  try {
    const projectId = typeof request.query.projectId === 'string' ? request.query.projectId : undefined;
    const threads = await prisma.outreachThread.findMany({
      where: {
        projectId
      },
      include: {
        expert: true,
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 20
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 200
    });
    response.status(200).json(threads);
  } catch (error) {
    next(error);
  }
});

adminRoutes.patch('/outreach/threads/:threadId', async (request, response, next) => {
  try {
    const params = threadIdParamsSchema.parse(request.params);
    const body = threadUpdateSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', body.error.flatten());
    }
    const existing = await prisma.outreachThread.findUnique({ where: { id: params.threadId } });
    if (!existing || existing.deletedAt) {
      throw new AppError('Thread not found', 404, 'thread_not_found');
    }
    const updated = await prisma.outreachThread.update({
      where: { id: params.threadId },
      data: { status: body.data.status }
    });
    await publishRealtimeEvent({
      namespace: 'admin',
      event: 'outreach.thread.updated',
      data: { threadId: params.threadId, status: body.data.status }
    });
    response.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/screening/responses', async (request, response, next) => {
  try {
    const projectId = typeof request.query.projectId === 'string' ? request.query.projectId : undefined;
    const statuses = typeof request.query.status === 'string' ? request.query.status.split(',') : undefined;
    const responses = await prisma.screeningResponse.findMany({
      where: {
        projectId,
        status: statuses ? { in: statuses as never[] } : undefined
      },
      include: {
        question: true,
        expert: true
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 300
    });
    response.status(200).json(responses);
  } catch (error) {
    next(error);
  }
});

adminRoutes.patch('/screening/:responseId', async (request, response, next) => {
  try {
    const params = screeningActionParamsSchema.parse(request.params);
    const body = screeningUpdateSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', body.error.flatten());
    }
    const existing = await prisma.screeningResponse.findUnique({ where: { id: params.responseId } });
    if (!existing) {
      throw new AppError('Screening response not found', 404, 'screening_response_not_found');
    }
    const updated = await prisma.screeningResponse.update({
      where: { id: params.responseId },
      data: {
        ...body.data,
        submittedAt: body.data.responseText ? new Date() : undefined
      },
      include: { question: true, expert: true }
    });
    response.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

adminRoutes.post('/screening/:responseId/follow-up', async (request, response, next) => {
  try {
    const params = screeningActionParamsSchema.parse(request.params);
    const screeningResponse = await prisma.screeningResponse.findUnique({
      where: {
        id: params.responseId
      }
    });
    if (!screeningResponse) {
      throw new AppError('Screening response not found', 404, 'screening_response_not_found');
    }
    await screeningService.processFollowUp(screeningResponse.projectId, screeningResponse.expertId);
    response.status(200).json({
      accepted: true
    });
  } catch (error) {
    next(error);
  }
});

adminRoutes.post('/screening/:responseId/escalate', async (request, response, next) => {
  try {
    const params = screeningActionParamsSchema.parse(request.params);
    const screeningResponse = await prisma.screeningResponse.findUnique({
      where: {
        id: params.responseId
      }
    });
    if (!screeningResponse) {
      throw new AppError('Screening response not found', 404, 'screening_response_not_found');
    }

    await prisma.$transaction([
      prisma.screeningResponse.update({
        where: {
          id: params.responseId
        },
        data: {
          status: 'ESCALATED'
        }
      }),
      prisma.callTask.create({
        data: {
          projectId: screeningResponse.projectId,
          expertId: screeningResponse.expertId,
          status: 'PENDING',
          priorityScore: 99
        }
      })
    ]);

    await publishRealtimeEvent({
      namespace: 'admin',
      event: 'screening.escalated',
      data: {
        responseId: params.responseId,
        projectId: screeningResponse.projectId,
        expertId: screeningResponse.expertId
      }
    });

    response.status(200).json({
      escalated: true
    });
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/call-board', async (_request, response, next) => {
  try {
    const [tasks, callers, metrics] = await Promise.all([
      prisma.callTask.findMany({
        where: {
          status: {
            in: ['PENDING', 'ASSIGNED', 'DIALING']
          }
        },
        include: {
          expert: true,
          caller: true
        },
        orderBy: {
          priorityScore: 'desc'
        },
        take: 300
      }),
      prisma.caller.findMany({
        where: {
          deletedAt: null
        },
        orderBy: {
          updatedAt: 'desc'
        }
      }),
      prisma.callerPerformanceMetric.findMany({
        orderBy: {
          snapshotAt: 'desc'
        },
        take: 300
      })
    ]);

    response.status(200).json({
      tasks,
      callers,
      metrics
    });
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/ranking/latest', async (request, response, next) => {
  try {
    const projectId = typeof request.query.projectId === 'string' ? request.query.projectId : undefined;
    const ranking = await prisma.rankingSnapshot.findMany({
      where: {
        projectId
      },
      include: {
        expert: true,
        project: true
      },
      orderBy: [
        {
          createdAt: 'desc'
        },
        {
          rank: 'asc'
        }
      ],
      take: 200
    });
    response.status(200).json(ranking);
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/observability/dlq', async (_request, response, next) => {
  try {
    const jobs = await prisma.deadLetterJob.findMany({
      orderBy: {
        failedAt: 'desc'
      },
      take: 200
    });
    response.status(200).json(jobs);
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/observability/webhooks', async (_request, response, next) => {
  try {
    const events = await prisma.processedWebhookEvent.findMany({
      orderBy: {
        processedAt: 'desc'
      },
      take: 200
    });
    response.status(200).json(events);
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/observability/provider-limits', async (_request, response, next) => {
  try {
    const events = await prisma.systemEvent.findMany({
      where: {
        entityType: 'provider_account'
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 200
    });
    response.status(200).json(events);
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/observability/fraud', async (_request, response, next) => {
  try {
    const [callLogs, fraudEvents] = await Promise.all([
      prisma.callLog.findMany({
        where: {
          fraudFlag: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 200
      }),
      prisma.systemEvent.findMany({
        where: {
          category: 'FRAUD'
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 200
      })
    ]);
    response.status(200).json({
      callLogs,
      events: fraudEvents
    });
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/observability/state-violations', async (_request, response, next) => {
  try {
    const events = await prisma.systemEvent.findMany({
      where: {
        category: 'ENFORCEMENT'
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 200
    });
    response.status(200).json(events);
  } catch (error) {
    next(error);
  }
});

adminRoutes.get('/workers/queue-stats', async (_request, response, next) => {
  try {
    const registry = getQueues();
    const allQueues = Object.values(registry) as import('bullmq').Queue[];

    const stats = await Promise.all(
      allQueues.map(async (queue) => {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        return {
          name: queue.name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0
        };
      })
    );

    response.status(200).json({ queues: stats });
  } catch (error) {
    next(error);
  }
});

const bulkProjectSchema = z.object({
  projectId: z.string().uuid().optional()
});

adminRoutes.post('/workers/export-leads', async (request, response, next) => {
  try {
    const { projectId } = bulkProjectSchema.parse(request.body);

    const exportableStatuses: LeadStatus[] = [
      'ENRICHED', 'OUTREACH_PENDING', 'CONTACTED', 'REPLIED', 'CONVERTED'
    ];
    const where: Record<string, unknown> = {
      status: { in: exportableStatuses },
      deletedAt: null,
      supabaseExportedAt: null,
      project: { supabaseProviderAccountId: { not: null } }
    };
    if (projectId) where.projectId = projectId;

    const leads = await prisma.lead.findMany({
      where: where as never,
      select: { id: true, projectId: true }
    });

    if (leads.length === 0) {
      response.status(200).json({ queued: 0 });
      return;
    }

    const batchTs = Date.now();
    const correlationId = `bulk-export-${batchTs}`;
    const queues = getQueues();

    for (const lead of leads) {
      await queues.supabaseSyncQueue.add(
        'supabase-sync.enriched-lead',
        { correlationId, data: { projectId: lead.projectId, leadId: lead.id } },
        { jobId: buildJobId('supabase-sync', lead.projectId, lead.id, batchTs) }
      );
    }

    response.status(200).json({ queued: leads.length });
  } catch (error) {
    next(error);
  }
});

const OUTREACH_CHANNELS: PrismaChannel[] = [
  'EMAIL', 'SMS', 'VOICEMAIL', 'WHATSAPP', 'RESPONDIO',
  'LINE', 'WECHAT', 'VIBER', 'TELEGRAM', 'KAKAOTALK'
];

adminRoutes.post('/workers/outreach-leads', async (request, response, next) => {
  try {
    const { projectId: filterProjectId } = bulkProjectSchema.parse(request.body);

    const projectWhere: Record<string, unknown> = {
      deletedAt: null,
      status: 'ACTIVE'
    };
    if (filterProjectId) projectWhere.id = filterProjectId;

    const projects = await prisma.project.findMany({
      where: projectWhere as never,
      select: { id: true, name: true, outreachMessageTemplate: true }
    });

    const batchTs = Date.now();
    const correlationId = `bulk-outreach-${batchTs}`;
    const queues = getQueues();
    let totalQueued = 0;

    for (const project of projects) {
      const template = project.outreachMessageTemplate;
      if (typeof template !== 'string' || !template.trim()) continue;

      const availableChannels: PrismaChannel[] = [];
      for (const ch of OUTREACH_CHANNELS) {
        if (await isChannelAvailableForProject(prisma, project.id, ch)) {
          availableChannels.push(ch);
        }
      }
      if (availableChannels.length === 0) continue;

      const leads = await prisma.lead.findMany({
        where: {
          projectId: project.id,
          status: 'ENRICHED',
          expertId: { not: null },
          deletedAt: null
        },
        select: {
          id: true, expertId: true, firstName: true, lastName: true,
          jobTitle: true, countryIso: true, metadata: true
        }
      });

      for (const lead of leads) {
        if (!lead.expertId) continue;

        const existingThread = await prisma.outreachThread.findFirst({
          where: { projectId: project.id, expertId: lead.expertId },
          select: { id: true }
        });
        if (existingThread) continue;

        const expert = await prisma.expert.findUnique({
          where: { id: lead.expertId },
          select: { currentCompany: true, countryIso: true }
        });

        const meta = (lead.metadata as Record<string, unknown> | null) ?? {};
        const countryIso = lead.countryIso ?? expert?.countryIso;
        const countryName = countryIso
          ? isoCodeToLocationName(countryIso)
          : (meta.country as string | undefined) ?? null;

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
            recipient = contacts.find((c) => c.type === 'PHONE')?.value
              ?? contacts.find((c) => c.type === 'EMAIL')?.value;
          }
          if (!recipient) continue;

          await queues.outreachQueue.add(
            'outreach.auto-send',
            {
              correlationId,
              data: {
                projectId: project.id,
                expertId: lead.expertId,
                channel,
                recipient,
                body,
                overrideCooldown: false
              }
            },
            { jobId: buildJobId('outreach', project.id, lead.expertId, channel, batchTs) }
          );
          didQueue = true;
        }

        if (didQueue) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'OUTREACH_PENDING' }
          });
          totalQueued++;
        }
      }
    }

    response.status(200).json({ queued: totalQueued });
  } catch (error) {
    next(error);
  }
});

