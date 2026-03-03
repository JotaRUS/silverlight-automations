import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import type { ProviderType } from '../../core/providers/providerTypes';
import { prisma } from '../../db/client';
import { ProviderAccountsService } from '../providers/providerAccountsService';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import { salesNavWebhookPayloadSchema } from './salesNavWebhookSchemas';

export const salesNavWebhookRoutes = Router();
const SALES_NAV_PROVIDER_TYPES: ProviderType[] = ['SALES_NAV_WEBHOOK', 'LINKEDIN'];
const providerAccountParamsSchema = z.object({
  providerAccountId: z.string().uuid()
});
const providerAccountsService = new ProviderAccountsService(prisma);

async function verifyLinkedInBearerToken(token: string): Promise<boolean> {
  const response = await fetch('https://api.linkedin.com/rest/leadForms?q=owner', {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'Linkedin-Version': '202602',
      'X-Restli-Protocol-Version': '2.0.0'
    }
  });

  // 2xx confirms access, 400 confirms token+endpoint reachability but invalid query shape,
  // 403 confirms token is syntactically valid but lacks product permissions. Only 401 is treated as invalid token.
  if (response.status >= 200 && response.status < 300) {
    return true;
  }
  if (response.status === 400 || response.status === 403) {
    return true;
  }
  return false;
}

salesNavWebhookRoutes.post('/:providerAccountId', async (request, response, next) => {
  try {
    const authHeader = request.header('authorization');
    const clientIdHeader = request.header('x-sales-nav-client-id');

    if (!authHeader && !clientIdHeader) {
      throw new AppError('Unauthorized sales navigator request', 401, 'sales_nav_unauthorized');
    }

    const params = providerAccountParamsSchema.parse(request.params);
    const providerAccount = await providerAccountsService.getActiveAccountOrThrow(params.providerAccountId);
    const providerType = providerAccount.providerType as ProviderType;
    if (!SALES_NAV_PROVIDER_TYPES.includes(providerType)) {
      throw new AppError('Unauthorized sales navigator request', 401, 'sales_nav_unauthorized');
    }

    const credentials = await providerAccountsService.getDecryptedCredentials(
      providerAccount.id,
      providerType
    );
    const storedClientId =
      typeof credentials.clientId === 'string' ? credentials.clientId : '';
    if (!storedClientId) {
      throw new AppError(
        'Sales Navigator provider must include LinkedIn client credentials',
        422,
        'sales_nav_missing_client_credentials'
      );
    }

    if (clientIdHeader && clientIdHeader !== storedClientId) {
      throw new AppError('Unauthorized sales navigator request', 401, 'sales_nav_unauthorized');
    }

    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        throw new AppError('Unauthorized sales navigator request', 401, 'sales_nav_unauthorized');
      }
      const isTokenValid = await verifyLinkedInBearerToken(token);
      if (!isTokenValid) {
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
