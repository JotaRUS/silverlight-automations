import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env';
import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { clearCsrfToken, issueCsrfToken } from '../../core/auth/csrf';
import { signAccessToken, type AuthRole } from '../../core/auth/jwt';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import type { ProviderType } from '../../core/providers/providerTypes';
import { namespacedRedisKey } from '../../core/redis/namespace';
import { prisma } from '../../db/client';
import {
  buildLinkedInAuthorizeUrl,
  buildLinkedInRedirectUri,
  exchangeLinkedInAuthorizationCode
} from '../../integrations/sales-nav/linkedinAuthCodeClient';
import { ProviderAccountsService } from '../../modules/providers/providerAccountsService';
import { redisConnection } from '../../queues/redis';

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const devLoginRequestSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'ops', 'caller'])
});

const linkedInAuthCodeAuthorizeQuerySchema = z.object({
  providerAccountId: z.string().uuid(),
  scope: z.string().optional(),
  responseMode: z.enum(['json', 'redirect']).optional().default('json')
});

const linkedInAuthCodeCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

function mapDbRole(dbRole: string): AuthRole {
  const lower = dbRole.toLowerCase();
  if (lower === 'admin' || lower === 'ops' || lower === 'caller') {
    return lower as AuthRole;
  }
  return 'caller';
}

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LINKEDIN_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const LINKEDIN_DEFAULT_SCOPES = ['r_liteprofile'];

interface LinkedInOAuthStateSession {
  providerAccountId: string;
  issuedToUserId: string;
  scopes: string[];
  expiresAt: number;
}

function oauthStateRedisKey(state: string): string {
  return namespacedRedisKey(`linkedin-oauth-state:${state}`);
}

async function setOAuthState(state: string, session: LinkedInOAuthStateSession): Promise<void> {
  const ttlSeconds = Math.ceil(LINKEDIN_OAUTH_STATE_TTL_MS / 1000);
  await redisConnection.set(oauthStateRedisKey(state), JSON.stringify(session), 'EX', ttlSeconds);
}

async function getAndDeleteOAuthState(state: string): Promise<LinkedInOAuthStateSession | null> {
  const key = oauthStateRedisKey(state);
  const raw = await redisConnection.get(key);
  if (!raw) return null;
  await redisConnection.del(key);
  const session = JSON.parse(raw) as LinkedInOAuthStateSession;
  if (session.expiresAt <= Date.now()) return null;
  return session;
}

const providerAccountsService = new ProviderAccountsService(prisma);

function normalizeLinkedInScopes(rawScope: string | undefined): string[] {
  if (!rawScope) {
    return [...LINKEDIN_DEFAULT_SCOPES];
  }

  const normalized = rawScope
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  if (!normalized.length) {
    return [...LINKEDIN_DEFAULT_SCOPES];
  }

  return Array.from(new Set(normalized));
}

export const authRoutes = Router();

authRoutes.post('/login', async (request, response, next) => {
  try {
    if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
      const devParsed = devLoginRequestSchema.safeParse(request.body);
      if (devParsed.success) {
        const { userId, role } = devParsed.data;
        const token = signAccessToken(userId, role);
        response.cookie('access_token', token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          path: '/',
          maxAge: COOKIE_MAX_AGE_MS
        });
        const csrfToken = issueCsrfToken(userId);
        response.status(200).json({
          authenticated: true,
          userId,
          role,
          csrfToken
        });
        return;
      }
    }

    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid credentials', 400, 'invalid_payload', parsed.error.flatten());
    }

    const caller = await prisma.caller.findUnique({
      where: { email: parsed.data.email }
    });
    if (!caller || !caller.passwordHash) {
      throw new AppError('Invalid email or password', 401, 'invalid_credentials');
    }

    const passwordValid = await bcrypt.compare(parsed.data.password, caller.passwordHash);
    if (!passwordValid) {
      throw new AppError('Invalid email or password', 401, 'invalid_credentials');
    }

    const role = mapDbRole(caller.role);
    const token = signAccessToken(caller.id, role);

    response.cookie('access_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: COOKIE_MAX_AGE_MS
    });

    const csrfToken = issueCsrfToken(caller.id);
    response.status(200).json({
      authenticated: true,
      userId: caller.id,
      role,
      name: caller.name,
      email: caller.email,
      csrfToken
    });
  } catch (error) {
    next(error);
  }
});

authRoutes.post('/logout', authenticate, (request, response) => {
  const auth = (request as RequestWithAuth).auth;
  if (auth?.userId) {
    clearCsrfToken(auth.userId);
  }
  response.clearCookie('access_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  response.status(200).json({
    authenticated: false
  });
});

authRoutes.get(
  '/linkedin/authorize',
  authenticate,
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const parsedQuery = linkedInAuthCodeAuthorizeQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw new AppError('Invalid payload', 400, 'invalid_payload', parsedQuery.error.flatten());
      }

      const auth = (request as RequestWithAuth).auth;
      if (!auth?.userId) {
        throw new AppError('Unauthorized', 401, 'unauthorized');
      }

      const providerAccount = await providerAccountsService.getActiveAccountOrThrow(
        parsedQuery.data.providerAccountId
      );
      const providerType = providerAccount.providerType as ProviderType;
      if (providerType !== 'SALES_NAV_WEBHOOK' && providerType !== 'LINKEDIN') {
        throw new AppError(
          'Provider account is not a LinkedIn Sales Navigator account',
          422,
          'provider_type_not_supported'
        );
      }

      const credentials = await providerAccountsService.getDecryptedCredentials(
        parsedQuery.data.providerAccountId,
        providerType
      );
      const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : '';
      const clientSecret =
        typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';
      if (!clientId || !clientSecret) {
        throw new AppError(
          'Provider credentials missing LinkedIn client ID or client secret',
          422,
          'missing_linkedin_client_credentials'
        );
      }

      const state = randomUUID();
      const scopes = normalizeLinkedInScopes(parsedQuery.data.scope);
      await setOAuthState(state, {
        providerAccountId: parsedQuery.data.providerAccountId,
        issuedToUserId: auth.userId,
        scopes,
        expiresAt: Date.now() + LINKEDIN_OAUTH_STATE_TTL_MS
      });

      const redirectUri = buildLinkedInRedirectUri(env.EXTERNAL_APP_BASE_URL);
      const authorizeUrl = buildLinkedInAuthorizeUrl({
        clientId,
        redirectUri,
        state,
        scopes
      });

      if (parsedQuery.data.responseMode === 'redirect') {
        response.redirect(302, authorizeUrl);
        return;
      }

      response.status(200).json({
        authorizeUrl,
        redirectUri,
        state,
        scopes,
        expiresAt: new Date(Date.now() + LINKEDIN_OAUTH_STATE_TTL_MS).toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

authRoutes.get('/linkedin/callback', async (request, response, next) => {
  try {
    const parsedQuery = linkedInAuthCodeCallbackQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsedQuery.error.flatten());
    }

    if (parsedQuery.data.error) {
      throw new AppError(
        parsedQuery.data.error_description ?? parsedQuery.data.error,
        400,
        'linkedin_oauth_error',
        {
          provider: 'linkedin',
          error: parsedQuery.data.error,
          errorDescription: parsedQuery.data.error_description
        }
      );
    }

    if (!parsedQuery.data.state || !parsedQuery.data.code) {
      throw new AppError(
        'Missing OAuth code/state in callback',
        400,
        'invalid_payload',
        { codePresent: Boolean(parsedQuery.data.code), statePresent: Boolean(parsedQuery.data.state) }
      );
    }

    const stateSession = await getAndDeleteOAuthState(parsedQuery.data.state);
    if (!stateSession) {
      throw new AppError('OAuth state expired or invalid', 400, 'invalid_oauth_state');
    }

    const providerAccount = await providerAccountsService.getActiveAccountOrThrow(
      stateSession.providerAccountId
    );
    const providerType = providerAccount.providerType as ProviderType;
    const credentials = await providerAccountsService.getDecryptedCredentials(
      stateSession.providerAccountId,
      providerType
    );
    const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : '';
    const clientSecret =
      typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';
    if (!clientId || !clientSecret) {
      throw new AppError(
        'Provider credentials missing LinkedIn client ID or client secret',
        422,
        'missing_linkedin_client_credentials'
      );
    }

    const redirectUri = buildLinkedInRedirectUri(env.EXTERNAL_APP_BASE_URL);
    const correlationId = getRequestContext()?.correlationId ?? 'system';
    const tokenResponse = await exchangeLinkedInAuthorizationCode({
      code: parsedQuery.data.code,
      clientId,
      clientSecret,
      redirectUri,
      correlationId
    });

    const now = Date.now();
    const mergedCredentials: Record<string, unknown> = {
      ...credentials,
      oauthAccessToken: tokenResponse.access_token,
      oauthAccessTokenExpiresAt: new Date(now + tokenResponse.expires_in * 1000).toISOString(),
      oauthScope:
        typeof tokenResponse.scope === 'string' && tokenResponse.scope.length > 0
          ? tokenResponse.scope
          : stateSession.scopes.join(' ')
    };
    if (typeof tokenResponse.refresh_token === 'string' && tokenResponse.refresh_token.length > 0) {
      mergedCredentials.oauthRefreshToken = tokenResponse.refresh_token;
    }
    if (
      typeof tokenResponse.refresh_token_expires_in === 'number' &&
      Number.isFinite(tokenResponse.refresh_token_expires_in) &&
      tokenResponse.refresh_token_expires_in > 0
    ) {
      mergedCredentials.oauthRefreshTokenExpiresAt = new Date(
        now + tokenResponse.refresh_token_expires_in * 1000
      ).toISOString();
    }

    await providerAccountsService.update(stateSession.providerAccountId, {
      credentials: mergedCredentials
    });

    response.status(200).json({
      connected: true,
      providerAccountId: stateSession.providerAccountId,
      redirectUri,
      scope: mergedCredentials.oauthScope,
      accessTokenExpiresAt: mergedCredentials.oauthAccessTokenExpiresAt,
      refreshTokenExpiresAt: mergedCredentials.oauthRefreshTokenExpiresAt ?? null
    });
  } catch (error) {
    next(error);
  }
});

const profileUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(6).max(128).optional()
  })
  .refine(
    (v) => !(v.newPassword && !v.currentPassword),
    { message: 'Current password is required to set a new password', path: ['currentPassword'] }
  );

authRoutes.patch('/profile', authenticate, async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (!auth?.userId) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }

    const parsed = profileUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const caller = await prisma.caller.findUnique({ where: { id: auth.userId } });
    if (!caller) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.name) {
      updateData.name = parsed.data.name;
    }

    if (parsed.data.newPassword) {
      const valid = await bcrypt.compare(parsed.data.currentPassword!, caller.passwordHash!);
      if (!valid) {
        throw new AppError('Current password is incorrect', 400, 'invalid_current_password');
      }
      updateData.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError('Nothing to update', 400, 'empty_update');
    }

    const updated = await prisma.caller.update({
      where: { id: auth.userId },
      data: updateData
    });

    response.status(200).json({
      userId: updated.id,
      name: updated.name,
      email: updated.email,
      role: mapDbRole(updated.role)
    });
  } catch (error) {
    next(error);
  }
});

authRoutes.get('/csrf', authenticate, (request, response) => {
  const auth = (request as RequestWithAuth).auth;
  if (!auth?.userId) {
    throw new AppError('Unauthorized', 401, 'unauthorized');
  }
  const token = issueCsrfToken(auth.userId);
  response.status(200).json({
    csrfToken: token
  });
});
