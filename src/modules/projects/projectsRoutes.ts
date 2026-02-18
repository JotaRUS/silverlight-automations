import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
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
