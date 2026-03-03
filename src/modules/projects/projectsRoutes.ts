import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import {
  attachCompaniesSchema,
  projectCreateSchema,
  projectUpdateSchema,
  salesNavSearchCreateSchema,
  screeningQuestionCreateSchema,
  screeningQuestionUpdateSchema
} from './projectSchemas';
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

projectsRoutes.post('/:projectId/kick', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const project = await projectsService.getProject(params.projectId);
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found');
    }

    const timeSlice = new Date().toISOString().slice(0, 16);
    let sourcingQueued = false;
    let enrichmentQueued = 0;

    if (project.apolloProviderAccountId) {
      const locations = project.geographyIsoCodes?.length
        ? project.geographyIsoCodes
        : undefined;

      const jobId = buildJobId('apollo-sourcing', params.projectId, timeSlice);
      await getQueues().apolloLeadSourcingQueue.add(
        'apollo-lead-sourcing.search',
        {
          correlationId: request.headers['x-correlation-id'] as string || 'api-kick',
          data: {
            projectId: params.projectId,
            personLocations: locations,
            maxPages: 2,
            perPage: 25
          }
        },
        { jobId }
      );
      sourcingQueued = true;
    }

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
            fullName: lead.fullName ?? undefined,
            companyName,
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

    response.status(202).json({ sourcingQueued, enrichmentQueued });
  } catch (error) {
    next(error);
  }
});

const apolloSearchBodySchema = z.object({
  personLocations: z.array(z.string()).optional(),
  personTitles: z.array(z.string()).optional(),
  personSeniorities: z.array(z.string()).optional(),
  personDepartments: z.array(z.string()).optional(),
  personFunctions: z.array(z.string()).optional(),
  personNotTitles: z.array(z.string()).optional(),
  personSkills: z.array(z.string()).optional(),
  organizationDomains: z.array(z.string()).optional(),
  organizationNames: z.array(z.string()).optional(),
  organizationLocations: z.array(z.string()).optional(),
  organizationNumEmployeesRanges: z.array(z.string()).optional(),
  keywords: z.string().optional(),
  maxPages: z.number().int().min(1).max(10).optional(),
  perPage: z.number().int().min(1).max(100).optional()
});

projectsRoutes.post('/:projectId/apollo-search', async (request, response, next) => {
  try {
    const params = parseOrThrow(pathParamsSchema, request.params);
    const body = parseOrThrow(apolloSearchBodySchema, request.body);
    const project = await projectsService.getProject(params.projectId);
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found');
    }
    if (!project.apolloProviderAccountId) {
      throw new AppError(
        'No Apollo provider bound to this project',
        422,
        'no_apollo_provider'
      );
    }

    const locations = body.personLocations?.length
      ? body.personLocations
      : (project.geographyIsoCodes?.length ? project.geographyIsoCodes : undefined);

    const jobId = buildJobId(
      'apollo-search',
      params.projectId,
      new Date().toISOString().slice(0, 16)
    );

    await getQueues().apolloLeadSourcingQueue.add(
      'apollo-lead-sourcing.search',
      {
        correlationId: request.headers['x-correlation-id'] as string || 'api',
        data: {
          projectId: params.projectId,
          personLocations: locations,
          personTitles: body.personTitles,
          personSeniorities: body.personSeniorities,
          personDepartments: body.personDepartments,
          personFunctions: body.personFunctions,
          personNotTitles: body.personNotTitles,
          personSkills: body.personSkills,
          organizationDomains: body.organizationDomains,
          organizationNames: body.organizationNames,
          organizationLocations: body.organizationLocations,
          organizationNumEmployeesRanges: body.organizationNumEmployeesRanges,
          keywords: body.keywords,
          maxPages: body.maxPages,
          perPage: body.perPage
        }
      },
      { jobId }
    );

    response.status(202).json({ message: 'Apollo search queued', jobId });
  } catch (error) {
    next(error);
  }
});
