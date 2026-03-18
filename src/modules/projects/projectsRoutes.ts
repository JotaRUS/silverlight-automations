import type { Channel as PrismaChannel } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import {
  attachCompaniesSchema,
  attachJobTitlesSchema,
  projectCreateSchema,
  projectUpdateSchema,
  salesNavSearchCreateSchema,
  screeningQuestionCreateSchema,
  screeningQuestionUpdateSchema
} from './projectSchemas';
import type { AttachJobTitlesInput } from './projectsService';
import { ProjectsService } from './projectsService';

const pathParamsSchema = z.object({
  projectId: z.string().uuid()
});

const screeningQuestionPathParamsSchema = z.object({
  projectId: z.string().uuid(),
  questionId: z.string().uuid()
});

function parseOrThrow<TOutput>(
  schema: z.ZodType<TOutput>,
  value: unknown
): TOutput {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
  }
  return parsed.data;
}

const projectsService = new ProjectsService(prisma);

export const projectsRoutes = Router();

projectsRoutes.use(authenticate, authorize(['admin', 'ops']));

projectsRoutes.post('/', async (request, response, next) => {
  try {
    const payload = parseOrThrow(projectCreateSchema, request.body);
    const project = await projectsService.createProject(payload);
    response.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.get('/', async (_request, response, next) => {
  try {
    const projects = await projectsService.listProjects();
    response.status(200).json(projects);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.get('/:projectId', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const project = await projectsService.getProject(params.projectId);
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found');
    }
    response.status(200).json(project);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.patch('/:projectId', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const payload = parseOrThrow(projectUpdateSchema, request.body);
    const project = await projectsService.updateProject(params.projectId, payload);
    response.status(200).json(project);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.delete('/:projectId', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const existing = await projectsService.getProject(params.projectId);
    if (!existing) {
      throw new AppError('Project not found', 404, 'project_not_found');
    }
    await projectsService.deleteProject(params.projectId);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

projectsRoutes.post('/:projectId/companies', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const payload = parseOrThrow(attachCompaniesSchema, request.body);
    const count = await projectsService.attachCompanies(params.projectId, payload);
    response.status(201).json({
      createdOrUpdated: count
    });
  } catch (error) {
    next(error);
  }
});

projectsRoutes.get('/:projectId/companies', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const companies = await projectsService.listCompanies(params.projectId);
    response.status(200).json(companies);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.get('/:projectId/job-titles', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const jobTitles = await projectsService.listJobTitles(params.projectId);
    response.status(200).json(jobTitles);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.post('/:projectId/job-titles', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const payload = parseOrThrow(attachJobTitlesSchema, request.body) as AttachJobTitlesInput;
    const count = await projectsService.attachJobTitles(params.projectId, payload);
    response.status(201).json({
      createdOrUpdated: count
    });
  } catch (error) {
    next(error);
  }
});

projectsRoutes.post('/:projectId/sales-nav-searches', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const payload = parseOrThrow(salesNavSearchCreateSchema, request.body);
    const count = await projectsService.addSalesNavSearches(params.projectId, payload);
    response.status(201).json({
      created: count
    });
  } catch (error) {
    next(error);
  }
});

projectsRoutes.get('/:projectId/sales-nav-searches', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const searches = await projectsService.listSalesNavSearches(params.projectId);
    response.json(searches);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.delete('/:projectId/sales-nav-searches/:searchId', async (request, response, next) => {
  try {
    const params = parseOrThrow(
      pathParamsSchema.extend({ searchId: z.string().uuid() }),
      request.params
    );
    await projectsService.deleteSalesNavSearch(params.projectId, params.searchId);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

projectsRoutes.post('/:projectId/import-leads', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const body = parseOrThrow(
      z.object({
        leads: z.array(z.record(z.string())).min(1),
        salesNavSearchId: z.string().uuid().optional()
      }),
      request.body
    );
    const result = await projectsService.importLeads(params.projectId, body.leads, body.salesNavSearchId);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.get('/:projectId/screening-questions', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const questions = await projectsService.listScreeningQuestions(params.projectId);
    response.status(200).json(questions);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.post('/:projectId/screening-questions', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const payload = parseOrThrow(screeningQuestionCreateSchema, request.body);
    const question = await projectsService.createScreeningQuestion(params.projectId, payload);
    response.status(201).json(question);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.patch('/:projectId/screening-questions/:questionId', async (request, response, next) => {
  try {
    const params = parseOrThrow(screeningQuestionPathParamsSchema, request.params);
    const payload = parseOrThrow(screeningQuestionUpdateSchema, request.body);
    const question = await projectsService.updateScreeningQuestion(params.questionId, payload);
    response.status(200).json(question);
  } catch (error) {
    next(error);
  }
});

projectsRoutes.delete('/:projectId/screening-questions/:questionId', async (request, response, next) => {
  try {
    const params = parseOrThrow(screeningQuestionPathParamsSchema, request.params);
    await projectsService.deleteScreeningQuestion(params.questionId);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

projectsRoutes.post('/:projectId/kick', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const project = await projectsService.getProject(params.projectId);
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found');
    }

    const timeSlice = new Date().toISOString().slice(0, 16);
    let enrichmentQueued = 0;

    const newLeads = await prisma.lead.findMany({
      where: { projectId: params.projectId, status: 'NEW', deletedAt: null },
      take: 50
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
          correlationId: 'api-kick',
          data: {
            leadId: lead.id,
            projectId: params.projectId,
            firstName: lead.firstName ?? undefined,
            lastName: lead.lastName ?? undefined,
            fullName: lead.fullName ?? undefined,
            companyName,
            jobTitle: lead.jobTitle ?? undefined,
            linkedinUrl: lead.linkedinUrl ?? undefined,
            countryIso: lead.countryIso && lead.countryIso.length === 2 ? lead.countryIso : undefined,
            emails,
            phones
          }
        },
        { jobId: buildJobId('enrichment', lead.id, timeSlice) }
      );
      enrichmentQueued += 1;
    }

    response.status(202).json({ enrichmentQueued });
  } catch (error) {
    next(error);
  }
});

const OUTREACH_CHANNEL_BINDINGS: { channel: PrismaChannel; bindingField: string; label: string }[] = [
  { channel: 'EMAIL', bindingField: 'emailProviderAccountId', label: 'Email' },
  { channel: 'WHATSAPP', bindingField: 'whatsapp2chatProviderAccountId', label: 'WhatsApp' },
  { channel: 'SMS', bindingField: 'twilioProviderAccountId', label: 'SMS' },
  { channel: 'LINKEDIN', bindingField: 'salesNavWebhookProviderAccountId', label: 'LinkedIn' },
  { channel: 'RESPONDIO', bindingField: 'respondioProviderAccountId', label: 'Respond.io' },
  { channel: 'LINE', bindingField: 'lineProviderAccountId', label: 'LINE' },
  { channel: 'WECHAT', bindingField: 'wechatProviderAccountId', label: 'WeChat' },
  { channel: 'VIBER', bindingField: 'viberProviderAccountId', label: 'Viber' },
  { channel: 'TELEGRAM', bindingField: 'telegramProviderAccountId', label: 'Telegram' },
  { channel: 'KAKAOTALK', bindingField: 'kakaotalkProviderAccountId', label: 'KakaoTalk' },
  { channel: 'PHONE', bindingField: 'yayProviderAccountId', label: 'Phone' },
  { channel: 'VOICEMAIL', bindingField: 'voicemailDropProviderAccountId', label: 'Voicemail' }
];

projectsRoutes.get('/:projectId/available-channels', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const project = await prisma.project.findUnique({
      where: { id: params.projectId }
    });
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found');
    }

    const projectRecord = project as unknown as Record<string, unknown>;
    const available: { channel: PrismaChannel; label: string }[] = [];

    for (const binding of OUTREACH_CHANNEL_BINDINGS) {
      const accountId = projectRecord[binding.bindingField];
      if (typeof accountId === 'string' && accountId) {
        const activeAccount = await prisma.providerAccount.findFirst({
          where: { id: accountId, isActive: true },
          select: { id: true }
        });
        if (activeAccount) {
          available.push({ channel: binding.channel, label: binding.label });
        }
      }
    }

    response.json(available);
  } catch (error) {
    next(error);
  }
});

const scrapeSalesNavBodySchema = z.object({
  salesNavSearchId: z.string().uuid().optional()
});

projectsRoutes.post('/:projectId/scrape-sales-nav', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const body = scrapeSalesNavBodySchema.safeParse(request.body);
    const salesNavSearchId = body.success ? body.data.salesNavSearchId : undefined;

    const project = await projectsService.getProject(params.projectId);
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found');
    }

    if (!project.salesNavWebhookProviderAccountId) {
      throw new AppError(
        'No Sales Navigator provider bound to this project',
        422,
        'no_sales_nav_provider'
      );
    }

    const activeLeads = await prisma.lead.count({
      where: { projectId: params.projectId, status: { not: 'DISQUALIFIED' }, deletedAt: null }
    });
    if (activeLeads >= project.targetThreshold) {
      response.status(200).json({ queued: 0, message: `Target already met (${activeLeads}/${project.targetThreshold} leads in pipeline)` });
      return;
    }

    const searches = salesNavSearchId
      ? await prisma.salesNavSearch.findMany({
          where: { id: salesNavSearchId, projectId: params.projectId, isActive: true, deletedAt: null }
        })
      : await prisma.salesNavSearch.findMany({
          where: { projectId: params.projectId, isActive: true, deletedAt: null }
        });

    if (searches.length === 0) {
      throw new AppError(
        'No active Sales Navigator searches found for this project',
        422,
        'no_active_searches'
      );
    }

    const correlationId = (request.headers['x-correlation-id'] as string) || 'api-scrape';
    const timeSlice = new Date().toISOString().slice(0, 16);
    let queued = 0;

    for (const search of searches) {
      const resumeFromPage = search.paginationCursor
        ? Math.max(1, Number.parseInt(search.paginationCursor, 10) || 1)
        : 1;

      const jobId = buildJobId('sales-nav-scraper', params.projectId, search.id, timeSlice);
      await getQueues().salesNavScraperQueue.add(
        'sales-nav-scraper.scrape',
        {
          correlationId,
          data: {
            projectId: params.projectId,
            salesNavSearchId: search.id,
            sourceUrl: search.sourceUrl,
            resumeFromPage
          }
        },
        { jobId }
      );
      queued++;
    }

    response.status(202).json({ queued });
  } catch (error) {
    next(error);
  }
});

projectsRoutes.get('/:projectId/scraping-status', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);

    const lastStarted = await prisma.systemEvent.findFirst({
      where: {
        entityType: 'sales_nav_scraper',
        message: 'sales_nav_scraper_started',
        payload: { path: ['projectId'], equals: params.projectId }
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    if (!lastStarted) {
      response.json({ scraping: false });
      return;
    }

    const lastFinished = await prisma.systemEvent.findFirst({
      where: {
        entityType: 'sales_nav_scraper',
        message: { in: ['sales_nav_scraper_completed', 'sales_nav_scraper_failed'] },
        payload: { path: ['projectId'], equals: params.projectId },
        createdAt: { gte: lastStarted.createdAt }
      },
      select: { id: true }
    });

    response.json({ scraping: !lastFinished });
  } catch (error) {
    next(error);
  }
});
