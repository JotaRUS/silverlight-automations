import { Router } from 'express';
import { z } from 'zod';

import type { Prisma } from '@prisma/client';

import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { getSalesNavAccessToken } from '../../integrations/sales-nav/salesNavOAuthClient';
import {
  listLeadForms,
  createLeadNotification,
  listLeadNotifications,
  deleteLeadNotification
} from '../../integrations/sales-nav/linkedInLeadSyncClient';
import { buildQuestionFieldMap } from '../sales-nav/linkedInResponseMapper';
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

providerAccountRoutes.delete('/:providerAccountId', authorize(['admin', 'ops']), async (request, response, next) => {
  try {
    const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
    const deleted = await providerAccountsService.softDelete(params.providerAccountId);
    response.status(200).json(deleted);
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

// ---------------------------------------------------------------------------
// LinkedIn Lead Sync — Lead Forms listing & selection
// ---------------------------------------------------------------------------

async function getLinkedInTokenAndOrgId(
  providerAccountId: string
): Promise<{ token: string; organizationId: string }> {
  const credentials = await providerAccountsService.getDecryptedCredentials(
    providerAccountId,
    'SALES_NAV_WEBHOOK'
  );
  const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : '';
  const clientSecret = typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';
  const organizationId = typeof credentials.organizationId === 'string' ? credentials.organizationId : '';
  if (!clientId || !clientSecret || !organizationId) {
    throw new AppError(
      'LinkedIn Sales Navigator account missing required credentials (clientId, clientSecret, organizationId)',
      422,
      'missing_linkedin_credentials'
    );
  }
  const token = await getSalesNavAccessToken(clientId, clientSecret);
  return { token, organizationId };
}

providerAccountRoutes.get(
  '/:providerAccountId/linkedin/lead-forms',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const { token, organizationId } = await getLinkedInTokenAndOrgId(params.providerAccountId);
      const formsResponse = await listLeadForms(token, organizationId, { count: 100 });

      const forms = formsResponse.elements.map((form) => ({
        id: String(form.id),
        name: form.name,
        state: form.state,
        created: form.created,
        lastModified: form.lastModified,
        questionCount: form.content?.questions?.length ?? 0,
        questions: (form.content?.questions ?? []).map((q) => ({
          name: q.name,
          predefinedField: q.predefinedField
        }))
      }));

      response.status(200).json(forms);
    } catch (error) {
      next(error);
    }
  }
);

const syncedFormsSchema = z.object({
  formIds: z.array(z.string().min(1))
});

providerAccountRoutes.patch(
  '/:providerAccountId/linkedin/synced-forms',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const { formIds } = parseOrThrow(syncedFormsSchema, request.body);
      const { token } = await getLinkedInTokenAndOrgId(params.providerAccountId);

      const account = await prisma.providerAccount.findUniqueOrThrow({
        where: { id: params.providerAccountId }
      });
      const syncMeta = (account.syncMetadata as Record<string, unknown> | null) ?? {};

      const leadFormCache: Record<string, unknown> = {};
      for (const formId of formIds) {
        const { getLeadForm } = await import('../../integrations/sales-nav/linkedInLeadSyncClient');
        const form = await getLeadForm(token, formId);
        leadFormCache[formId] = {
          name: form.name,
          questionFieldMap: buildQuestionFieldMap(form),
          cachedAt: new Date().toISOString()
        };
      }

      const updatedMeta = {
        ...syncMeta,
        syncedLeadFormIds: formIds,
        leadFormCache: {
          ...(syncMeta.leadFormCache as Record<string, unknown> | undefined),
          ...leadFormCache
        }
      };

      await prisma.providerAccount.update({
        where: { id: params.providerAccountId },
        data: { syncMetadata: updatedMeta as Prisma.InputJsonValue }
      });

      response.status(200).json(updatedMeta);
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// LinkedIn Lead Sync — Webhook subscription management
// ---------------------------------------------------------------------------

providerAccountRoutes.post(
  '/:providerAccountId/linkedin/webhook-subscription',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const { token, organizationId } = await getLinkedInTokenAndOrgId(params.providerAccountId);

      const webhookUrl = `${env.EXTERNAL_APP_BASE_URL}/webhooks/sales-nav/${params.providerAccountId}/notification`;
      const subscription = await createLeadNotification(token, webhookUrl, organizationId, 'SPONSORED');

      const account = await prisma.providerAccount.findUniqueOrThrow({
        where: { id: params.providerAccountId }
      });
      const syncMeta = (account.syncMetadata as Record<string, unknown> | null) ?? {};
      await prisma.providerAccount.update({
        where: { id: params.providerAccountId },
        data: {
          syncMetadata: {
            ...syncMeta,
            webhookSubscriptionId: String(subscription.id)
          } as Prisma.InputJsonValue
        }
      });

      response.status(201).json({
        subscriptionId: String(subscription.id),
        webhookUrl
      });
    } catch (error) {
      next(error);
    }
  }
);

providerAccountRoutes.get(
  '/:providerAccountId/linkedin/webhook-subscriptions',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const { token, organizationId } = await getLinkedInTokenAndOrgId(params.providerAccountId);
      const subscriptions = await listLeadNotifications(token, organizationId, 'SPONSORED');
      response.status(200).json(subscriptions.elements);
    } catch (error) {
      next(error);
    }
  }
);

const webhookSubscriptionIdSchema = z.object({
  subscriptionId: z.string().min(1)
});

providerAccountRoutes.delete(
  '/:providerAccountId/linkedin/webhook-subscriptions/:subscriptionId',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const { subscriptionId } = parseOrThrow(webhookSubscriptionIdSchema, request.params);
      const { token } = await getLinkedInTokenAndOrgId(params.providerAccountId);

      await deleteLeadNotification(token, subscriptionId);

      const account = await prisma.providerAccount.findUniqueOrThrow({
        where: { id: params.providerAccountId }
      });
      const syncMeta = (account.syncMetadata as Record<string, unknown> | null) ?? {};
      if ((syncMeta.webhookSubscriptionId as string) === subscriptionId) {
        await prisma.providerAccount.update({
          where: { id: params.providerAccountId },
          data: {
            syncMetadata: {
              ...syncMeta,
              webhookSubscriptionId: null
            } as Prisma.InputJsonValue
          }
        });
      }

      response.status(200).json({ deleted: true });
    } catch (error) {
      next(error);
    }
  }
);

