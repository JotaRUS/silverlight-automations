import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { prisma } from '../../db/client';
import { ProviderAccountsService } from '../providers/providerAccountsService';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import { salesNavWebhookPayloadSchema } from './salesNavWebhookSchemas';

export const salesNavWebhookRoutes = Router();
const providerAccountParamsSchema = z.object({
  providerAccountId: z.string().uuid()
});
const providerAccountsService = new ProviderAccountsService(prisma);

salesNavWebhookRoutes.post('/:providerAccountId', async (request, response, next) => {
  try {
    const authHeader = request.header('authorization');
    const clientIdHeader = request.header('x-sales-nav-client-id');

    if (!authHeader && !clientIdHeader) {
      throw new AppError('Unauthorized sales navigator request', 401, 'sales_nav_unauthorized');
    }

    const params = providerAccountParamsSchema.parse(request.params);
    const providerAccount = await providerAccountsService.getActiveAccountOrThrow(
      params.providerAccountId,
      'SALES_NAV_WEBHOOK'
    );
    const credentials = await providerAccountsService.getDecryptedCredentials(
      providerAccount.id,
      'SALES_NAV_WEBHOOK'
    );
    const storedClientId =
      typeof credentials.clientId === 'string' ? credentials.clientId : '';

    if (clientIdHeader && clientIdHeader !== storedClientId) {
      throw new AppError('Unauthorized sales navigator request', 401, 'sales_nav_unauthorized');
    }

    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        throw new AppError('Unauthorized sales navigator request', 401, 'sales_nav_unauthorized');
      }
    }

    const parsed = salesNavWebhookPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid sales navigator payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const payload = parsed.data;
    const correlationId = getRequestContext()?.correlationId ?? 'system';
    await enqueueWithContext(getQueues().salesNavIngestionQueue, 'sales-nav.ingest', payload, {
      jobId: buildJobId(
        'sales-nav',
        params.providerAccountId,
        payload.projectId,
        payload.normalizedUrl,
        correlationId
      )
    });

    response.status(202).json({
      accepted: true
    });
  } catch (error) {
    next(error);
  }
});
