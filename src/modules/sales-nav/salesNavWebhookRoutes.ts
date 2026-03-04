import { Router, raw as expressRaw } from 'express';
import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { logger } from '../../core/logging/logger';
import type { ProviderType } from '../../core/providers/providerTypes';
import { prisma } from '../../db/client';
import { ProviderAccountsService } from '../providers/providerAccountsService';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import { salesNavWebhookPayloadSchema, linkedInLeadNotificationSchema } from './salesNavWebhookSchemas';
import {
  computeLinkedInChallengeResponse,
  verifyLinkedInWebhookSignature
} from './linkedInWebhookSignature';

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

// ---------------------------------------------------------------------------
// LinkedIn leadNotifications webhook — challenge validation (GET)
// ---------------------------------------------------------------------------

salesNavWebhookRoutes.get('/:providerAccountId/notification', async (request, response, next) => {
  try {
    const challengeCode = request.query.challengeCode;
    if (typeof challengeCode !== 'string' || challengeCode.length === 0) {
      throw new AppError('Missing challengeCode query parameter', 400, 'missing_challenge_code');
    }

    const params = providerAccountParamsSchema.parse(request.params);
    const providerAccount = await providerAccountsService.getActiveAccountOrThrow(params.providerAccountId);
    const providerType = providerAccount.providerType as ProviderType;
    if (!SALES_NAV_PROVIDER_TYPES.includes(providerType)) {
      throw new AppError('Provider account is not a Sales Navigator type', 422, 'invalid_provider_type');
    }

    const credentials = await providerAccountsService.getDecryptedCredentials(
      providerAccount.id,
      providerType
    );
    const clientSecret = typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';
    if (!clientSecret) {
      throw new AppError('Missing client secret for challenge response', 422, 'missing_client_secret');
    }

    const challengeResponse = computeLinkedInChallengeResponse(challengeCode, clientSecret);

    response.status(200).json({
      challengeCode,
      challengeResponse
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// LinkedIn leadNotifications webhook — incoming notification (POST)
// ---------------------------------------------------------------------------

salesNavWebhookRoutes.post(
  '/:providerAccountId/notification',
  expressRaw({ type: 'application/json' }),
  async (request, response, next) => {
    try {
      const params = providerAccountParamsSchema.parse(request.params);
      const providerAccount = await providerAccountsService.getActiveAccountOrThrow(params.providerAccountId);
      const providerType = providerAccount.providerType as ProviderType;
      if (!SALES_NAV_PROVIDER_TYPES.includes(providerType)) {
        throw new AppError('Provider account is not a Sales Navigator type', 422, 'invalid_provider_type');
      }

      const credentials = await providerAccountsService.getDecryptedCredentials(
        providerAccount.id,
        providerType
      );
      const clientSecret = typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';

      const signatureHeader = request.header('x-li-signature') ?? '';
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from(JSON.stringify(request.body));

      if (clientSecret && signatureHeader) {
        if (!verifyLinkedInWebhookSignature(rawBody, signatureHeader, clientSecret)) {
          throw new AppError('Invalid LinkedIn webhook signature', 401, 'invalid_webhook_signature');
        }
      }

      const bodyParsed: unknown = Buffer.isBuffer(request.body)
        ? JSON.parse(request.body.toString('utf8')) as unknown
        : request.body;
      const notification = linkedInLeadNotificationSchema.parse(bodyParsed);

      if (notification.leadAction === 'CREATED') {
        const organizationId =
          typeof credentials.organizationId === 'string' ? credentials.organizationId : '';

        await enqueueWithContext(
          getQueues().salesNavIngestionQueue,
          'linkedin-lead-sync.fetch-response',
          {
            providerAccountId: params.providerAccountId,
            responseId: notification.leadGenFormResponse,
            formUrn: notification.leadGenForm,
            organizationId,
            leadType: notification.leadType
          },
          {
            jobId: buildJobId(
              'li-lead-sync',
              params.providerAccountId,
              notification.leadGenFormResponse
            )
          }
        );

        logger.info(
          {
            providerAccountId: params.providerAccountId,
            responseUrn: notification.leadGenFormResponse,
            leadAction: notification.leadAction
          },
          'linkedin-lead-notification-enqueued'
        );
      } else {
        logger.info(
          {
            providerAccountId: params.providerAccountId,
            responseUrn: notification.leadGenFormResponse,
            leadAction: notification.leadAction
          },
          'linkedin-lead-notification-ignored'
        );
      }

      response.status(200).json({ accepted: true });
    } catch (error) {
      next(error);
    }
  }
);
