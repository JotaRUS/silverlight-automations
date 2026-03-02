import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { prisma } from '../../db/client';
import {
  providerAccountBindProjectSchema,
  providerAccountCreateSchema,
  providerAccountListQuerySchema,
  providerAccountPathParamsSchema,
  providerAccountUpdateSchema
} from './providerAccountSchemas';
import { ProviderAccountsService } from './providerAccountsService';

function parseOrThrow<TOutput>(
  schema: z.ZodType<TOutput, z.ZodTypeDef, unknown>,
  value: unknown
): TOutput {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
  }
  return parsed.data;
}

const providerAccountsService = new ProviderAccountsService(prisma);

export const providerAccountRoutes = Router();

providerAccountRoutes.use(authenticate);

providerAccountRoutes.get('/', authorize(['admin', 'ops']), async (request, response, next) => {
  try {
    const query = parseOrThrow(providerAccountListQuerySchema, request.query);
    const accounts = await providerAccountsService.list(query);
    response.status(200).json(accounts);
  } catch (error) {
    next(error);
  }
});

providerAccountRoutes.post('/', authorize(['admin', 'ops']), async (request, response, next) => {
  try {
    const payload = parseOrThrow(providerAccountCreateSchema, request.body);
    const auth = (request as RequestWithAuth).auth;
    if (!auth?.userId) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }
    const created = await providerAccountsService.create(payload, auth.userId);
    response.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

providerAccountRoutes.get('/:providerAccountId', authorize(['admin', 'ops']), async (request, response, next) => {
  try {
    const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
    const account = await providerAccountsService.get(params.providerAccountId);
    response.status(200).json(account);
  } catch (error) {
    next(error);
  }
});

providerAccountRoutes.patch('/:providerAccountId', authorize(['admin', 'ops']), async (request, response, next) => {
  try {
    const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
    const payload = parseOrThrow(providerAccountUpdateSchema, request.body);
    const updated = await providerAccountsService.update(params.providerAccountId, payload);
    response.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

providerAccountRoutes.post(
  '/:providerAccountId/test-connection',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const correlationId = getRequestContext()?.correlationId ?? 'system';
      const updated = await providerAccountsService.runHealthCheck(params.providerAccountId, correlationId);
      response.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }
);

providerAccountRoutes.post(
  '/:providerAccountId/bind-project',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const payload = parseOrThrow(providerAccountBindProjectSchema, request.body);
      await providerAccountsService.bindToProject(params.providerAccountId, payload.projectId);
      response.status(200).json({
        bound: true
      });
    } catch (error) {
      next(error);
    }
  }
);

