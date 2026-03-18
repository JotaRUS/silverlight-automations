import { Router } from 'express';
import { z } from 'zod';

import type { Prisma } from '@prisma/client';

import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { env } from '../../config/env';
import { prisma } from '../../db/client';
import {
  getLinkedInOAuthToken,
  buildLinkedInAuthorizationUrl,
  generateOAuthState,
  parseOAuthState,
  exchangeAuthorizationCode
} from '../../integrations/sales-nav/salesNavOAuthClient';
import { encryptProviderCredentials } from '../../core/providers/providerCredentialsCrypto';
import {
  listLeadForms,
  createLeadNotification,
  listLeadNotifications,
  deleteLeadNotification,
  type LinkedInOwner
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

    if (payload.providerType === 'SALES_NAV_WEBHOOK') {
      const existing = await prisma.providerAccount.findFirst({
        where: { providerType: 'SALES_NAV_WEBHOOK', deletedAt: null },
        select: { id: true }
      });
      if (existing) {
        throw new AppError(
          'Only one Sales Navigator provider is allowed (cookie-based session). Use the existing one.',
          409,
          'sales_nav_already_exists'
        );
      }
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
// LinkedIn OAuth 3-legged flow
// ---------------------------------------------------------------------------

async function getLinkedInTokenAndOrgId(
  providerAccountId: string
): Promise<{ token: string; organizationId: string; sponsoredAccountId?: string }> {
  const result = await getLinkedInOAuthToken(providerAccountId, prisma);
  return {
    token: result.token,
    organizationId: result.organizationId,
    sponsoredAccountId: result.credentials.sponsoredAccountId
  };
}

providerAccountRoutes.get(
  '/:providerAccountId/linkedin/oauth/authorize',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const credentials = await providerAccountsService.getDecryptedCredentials(
        params.providerAccountId,
        'SALES_NAV_WEBHOOK'
      );
      const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : '';
      if (!clientId) {
        throw new AppError('Missing Client ID in provider credentials', 422, 'missing_client_id');
      }

      const state = generateOAuthState(params.providerAccountId);
      const redirectUri = env.LINKEDIN_OAUTH_REDIRECT_URI;
      const authUrl = buildLinkedInAuthorizationUrl(clientId, redirectUri, state);

      response.status(200).json({ authorizationUrl: authUrl, state });
    } catch (error) {
      next(error);
    }
  }
);

// The OAuth callback is mounted on a separate unauthenticated router (linkedInOAuthCallbackRoutes).

providerAccountRoutes.get(
  '/:providerAccountId/linkedin/oauth/status',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const credentials = await providerAccountsService.getDecryptedCredentials(
        params.providerAccountId,
        'SALES_NAV_WEBHOOK'
      );

      const hasToken = typeof credentials.oauthAccessToken === 'string' && credentials.oauthAccessToken.length > 0;
      const expiresAt = typeof credentials.oauthAccessTokenExpiresAt === 'string'
        ? credentials.oauthAccessTokenExpiresAt
        : null;
      const refreshExpiresAt = typeof credentials.oauthRefreshTokenExpiresAt === 'string'
        ? credentials.oauthRefreshTokenExpiresAt
        : null;

      let status: 'not_connected' | 'connected' | 'expired' = 'not_connected';
      if (hasToken && expiresAt) {
        const tokenExpired = new Date(expiresAt).getTime() <= Date.now();
        const refreshExpired = refreshExpiresAt
          ? new Date(refreshExpiresAt).getTime() <= Date.now()
          : true;
        if (!tokenExpired) {
          status = 'connected';
        } else if (!refreshExpired) {
          status = 'connected';
        } else {
          status = 'expired';
        }
      }

      const hasSessionCookie =
        typeof credentials.linkedInSessionCookie === 'string' &&
        credentials.linkedInSessionCookie.length > 0;
      const sessionCookieCapturedAt =
        typeof credentials.linkedInSessionCookieCapturedAt === 'string'
          ? credentials.linkedInSessionCookieCapturedAt
          : null;

      response
        .setHeader('Cache-Control', 'no-store')
        .status(200)
        .json({
          status,
          accessTokenExpiresAt: expiresAt,
          refreshTokenExpiresAt: refreshExpiresAt,
          scope: typeof credentials.oauthScope === 'string' ? credentials.oauthScope : null,
          linkedInSessionCookie: hasSessionCookie,
          linkedInSessionCookieCapturedAt: sessionCookieCapturedAt
        });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// LinkedIn Lead Sync — Lead Forms listing & selection
// ---------------------------------------------------------------------------

providerAccountRoutes.get(
  '/:providerAccountId/linkedin/lead-forms',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const params = parseOrThrow(providerAccountPathParamsSchema, request.params);
      const { token, organizationId } = await getLinkedInTokenAndOrgId(params.providerAccountId);
      const owner: LinkedInOwner = { type: 'organization', id: organizationId };
      const formsResponse = await listLeadForms(token, owner, { count: 100 });

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
      const { token, organizationId, sponsoredAccountId } = await getLinkedInTokenAndOrgId(params.providerAccountId);

      const webhookUrl = `${env.EXTERNAL_APP_BASE_URL}/webhooks/sales-nav/${params.providerAccountId}/notification`;
      const owner: LinkedInOwner = sponsoredAccountId
        ? { type: 'sponsoredAccount', id: sponsoredAccountId }
        : { type: 'organization', id: organizationId };
      const subscription = await createLeadNotification(token, webhookUrl, owner, 'SPONSORED');

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
      const { token, organizationId, sponsoredAccountId } = await getLinkedInTokenAndOrgId(params.providerAccountId);
      const owner: LinkedInOwner = sponsoredAccountId
        ? { type: 'sponsoredAccount', id: sponsoredAccountId }
        : { type: 'organization', id: organizationId };
      const subscriptions = await listLeadNotifications(token, owner, 'SPONSORED');
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

// ---------------------------------------------------------------------------
// LinkedIn OAuth callback — unauthenticated (browser redirect from LinkedIn)
// ---------------------------------------------------------------------------

export const linkedInOAuthCallbackRoutes = Router();

linkedInOAuthCallbackRoutes.get(
  '/linkedin/oauth/callback',
  async (request, response, next) => {
    try {
      const code = request.query.code;
      const state = request.query.state;
      const errorParam = request.query.error;

      if (typeof errorParam === 'string') {
        const errorDescription = typeof request.query.error_description === 'string'
          ? request.query.error_description
          : errorParam;
        response.status(200).send(
          `<html><body><h2>LinkedIn Authorization Failed</h2><p>${errorDescription}</p><p>You may close this window.</p></body></html>`
        );
        return;
      }

      if (typeof code !== 'string' || typeof state !== 'string') {
        throw new AppError('Missing code or state parameter', 400, 'invalid_oauth_callback');
      }

      const { providerAccountId } = parseOAuthState(state);

      const account = await prisma.providerAccount.findUniqueOrThrow({
        where: { id: providerAccountId }
      });
      const credentials = await providerAccountsService.getDecryptedCredentials(
        providerAccountId,
        account.providerType as 'SALES_NAV_WEBHOOK'
      );

      const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : '';
      const clientSecret = typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';
      if (!clientId || !clientSecret) {
        throw new AppError('Missing credentials for token exchange', 422, 'missing_credentials');
      }

      const tokens = await exchangeAuthorizationCode(
        code,
        clientId,
        clientSecret,
        env.LINKEDIN_OAUTH_REDIRECT_URI
      );

      const updatedCreds = {
        ...credentials,
        oauthAccessToken: tokens.accessToken,
        oauthAccessTokenExpiresAt: tokens.accessTokenExpiresAt,
        oauthRefreshToken: tokens.refreshToken,
        oauthRefreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        oauthScope: tokens.scope
      };

      const encrypted = encryptProviderCredentials(updatedCreds as Record<string, unknown>);
      await prisma.providerAccount.update({
        where: { id: providerAccountId },
        data: { credentialsJson: encrypted as unknown as Prisma.InputJsonValue }
      });

      response
        .setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'")
        .status(200)
        .send(
          `<!doctype html><html><head><meta charset="utf-8" /><title>LinkedIn Connected</title></head><body style="font-family: sans-serif; padding: 24px;"><p>LinkedIn authorization saved. You can close this window.</p><script>try{if(window.opener){window.opener.postMessage({type:'linkedin-oauth-success',providerAccountId:'${providerAccountId}'},'*');window.close();}}catch(e){}setTimeout(function(){window.close()},1000);</script></body></html>`
        );
    } catch (err) {
      next(err);
    }
  }
);

