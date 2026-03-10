import { Router } from 'express';

import { authenticate, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { ApiKeyService } from './apiKeyService';
import {
  apiKeyCreateSchema,
  apiKeyPathParamsSchema
} from './apiKeySchemas';

const apiKeyService = new ApiKeyService(prisma);

export const apiKeyRoutes = Router();

apiKeyRoutes.use(authenticate);

apiKeyRoutes.get('/', async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (!auth?.userId) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }

    const apiKeys = await apiKeyService.listForCaller(auth.userId);
    response.status(200).json(apiKeys);
  } catch (error) {
    next(error);
  }
});

apiKeyRoutes.post('/', async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (!auth?.userId) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }

    const parsed = apiKeyCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const created = await apiKeyService.createForCaller(auth.userId, parsed.data);
    response.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

apiKeyRoutes.post('/:apiKeyId/revoke', async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (!auth?.userId) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }

    const parsed = apiKeyPathParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const revoked = await apiKeyService.revokeForCaller(auth.userId, parsed.data.apiKeyId);
    response.status(200).json(revoked);
  } catch (error) {
    next(error);
  }
});
