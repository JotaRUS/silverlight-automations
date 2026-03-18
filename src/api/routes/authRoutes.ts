import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env';
import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { clearCsrfToken, issueCsrfToken } from '../../core/auth/csrf';
import { signAccessToken, type AuthRole } from '../../core/auth/jwt';
import { LinkedInOAuthStateStore } from '../../core/auth/linkedInOAuthStateStore';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import type { ProviderType } from '../../core/providers/providerTypes';
import { prisma } from '../../db/client';
import {
  buildLinkedInAuthorizeUrl,
  buildLinkedInRedirectUri,
  exchangeLinkedInAuthorizationCode
} from '../../integrations/sales-nav/linkedinAuthCodeClient';
import {
  captureLinkedInSessionCookieFromChromeProfile,
  getLinkedInChromeProfileDiagnostics
} from '../../integrations/sales-nav/linkedInChromeProfileSessionCapture';
import { launchLinkedInOAuthBrowser } from '../../integrations/sales-nav/linkedInPlaywrightAuth';
import {
  getLinkedInSessionCaptureStatus,
  runLinkedInSessionCapture
} from '../../integrations/sales-nav/linkedInSessionCaptureRegistry';
import { ProviderAccountsService } from '../../modules/providers/providerAccountsService';

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
  responseMode: z.enum(['json', 'redirect']).optional().default('json'),
  mode: z.enum(['json', 'redirect', 'playwright']).optional()
});

const linkedInAuthCodeCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

const providerAccountIdQuerySchema = z.object({
  providerAccountId: z.string().uuid()
});

function buildLinkedInOAuthSuccessHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>LinkedIn Connected</title>
  </head>
  <body style="font-family: sans-serif; padding: 24px;">
    <p>LinkedIn authorization saved. You can close this window.</p>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'linkedin-oauth-success' }, '*');
          window.close();
        }
      } catch {}
    </script>
  </body>
</html>`;
}

function mapDbRole(dbRole: string): AuthRole {
  const lower = dbRole.toLowerCase();
  if (lower === 'admin' || lower === 'ops' || lower === 'caller') {
    return lower as AuthRole;
  }
  return 'caller';
}

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LINKEDIN_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const LINKEDIN_DEFAULT_SCOPES = ['r_liteprofile'];

const linkedInOAuthStateStore = new LinkedInOAuthStateStore(LINKEDIN_OAUTH_STATE_TTL_SECONDS);
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
      await linkedInOAuthStateStore.set(state, {
        providerAccountId: parsedQuery.data.providerAccountId,
        issuedToUserId: auth.userId,
        scopes
      });

      const redirectUri = buildLinkedInRedirectUri(env.EXTERNAL_APP_BASE_URL);
      const authorizeUrl = buildLinkedInAuthorizeUrl({
        clientId,
        redirectUri,
        state,
        scopes
      });

      if (parsedQuery.data.mode === 'playwright') {
        let playwrightResult;
        try {
          playwrightResult = await launchLinkedInOAuthBrowser(authorizeUrl, redirectUri);
        } catch (pwError) {
          throw new AppError(
            `Playwright OAuth flow failed: ${pwError instanceof Error ? pwError.message : 'unknown error'}`,
            502,
            'playwright_oauth_failed'
          );
        }

        const stateSession = await linkedInOAuthStateStore.consume(playwrightResult.state);
        if (!stateSession) {
          throw new AppError('OAuth state expired or invalid', 400, 'invalid_oauth_state');
        }

        const correlationId = getRequestContext()?.correlationId ?? 'system';
        const tokenResponse = await exchangeLinkedInAuthorizationCode({
          code: playwrightResult.code,
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
              : scopes.join(' ')
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

        if (playwrightResult.liAtCookie) {
          mergedCredentials.linkedInSessionCookie = playwrightResult.liAtCookie;
          mergedCredentials.linkedInSessionCookieCapturedAt = new Date(now).toISOString();
          if (playwrightResult.liAtCookieExpiry) {
            mergedCredentials.linkedInSessionCookieExpiresAt = new Date(
              playwrightResult.liAtCookieExpiry * 1000
            ).toISOString();
          }
        }

        await providerAccountsService.update(stateSession.providerAccountId, {
          credentials: mergedCredentials
        });

        response.status(200).json({
          connected: true,
          providerAccountId: stateSession.providerAccountId,
          linkedInSessionCookieCaptured: Boolean(playwrightResult.liAtCookie),
          accessTokenExpiresAt: mergedCredentials.oauthAccessTokenExpiresAt,
          refreshTokenExpiresAt: mergedCredentials.oauthRefreshTokenExpiresAt ?? null
        });
        return;
      }

      if (parsedQuery.data.responseMode === 'redirect') {
        response.redirect(302, authorizeUrl);
        return;
      }

      response.status(200).json({
        authorizeUrl,
        redirectUri,
        state,
        scopes,
        expiresAt: new Date(Date.now() + LINKEDIN_OAUTH_STATE_TTL_SECONDS * 1000).toISOString()
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

    const stateSession = await linkedInOAuthStateStore.consume(parsedQuery.data.state);
    if (!stateSession) {
      throw new AppError('OAuth state expired or invalid', 400, 'invalid_oauth_state');
    }

    const providerAccount = await providerAccountsService.getActiveAccountOrThrow(
      stateSession.providerAccountId
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

    response
      .status(200)
      .type('html')
      .send(buildLinkedInOAuthSuccessHtml());
  } catch (error) {
    next(error);
  }
});

authRoutes.get(
  '/linkedin/session/preflight',
  authenticate,
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const parsedQuery = providerAccountIdQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw new AppError('Invalid payload', 400, 'invalid_payload', parsedQuery.error.flatten());
      }

      const providerAccount = await providerAccountsService.getActiveAccountOrThrow(
        parsedQuery.data.providerAccountId,
        'SALES_NAV_WEBHOOK'
      );
      const credentials = await providerAccountsService.getDecryptedCredentials(
        providerAccount.id,
        'SALES_NAV_WEBHOOK'
      );
      const diagnostics = await getLinkedInChromeProfileDiagnostics(credentials);

      response.status(200).json(diagnostics);
    } catch (error) {
      next(error);
    }
  }
);

authRoutes.get(
  '/linkedin/session/capture/status',
  authenticate,
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const parsedQuery = providerAccountIdQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw new AppError('Invalid payload', 400, 'invalid_payload', parsedQuery.error.flatten());
      }

      response.status(200).json(getLinkedInSessionCaptureStatus(parsedQuery.data.providerAccountId));
    } catch (error) {
      next(error);
    }
  }
);

authRoutes.post(
  '/linkedin/session/capture',
  authenticate,
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const parsedBody = providerAccountIdQuerySchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw new AppError('Invalid payload', 400, 'invalid_payload', parsedBody.error.flatten());
      }

      const providerAccount = await providerAccountsService.getActiveAccountOrThrow(
        parsedBody.data.providerAccountId,
        'SALES_NAV_WEBHOOK'
      );

      const startResult = runLinkedInSessionCapture(providerAccount.id, async () => {
        const credentials = await providerAccountsService.getDecryptedCredentials(
          providerAccount.id,
          'SALES_NAV_WEBHOOK'
        );
        const capture = await captureLinkedInSessionCookieFromChromeProfile(credentials);
        const now = Date.now();
        const mergedCredentials: Record<string, unknown> = {
          ...credentials,
          linkedInSessionCookie: capture.liAtCookie,
          linkedInSessionCookieCapturedAt: new Date(now).toISOString()
        };
        if (capture.liAtCookieExpiry) {
          mergedCredentials.linkedInSessionCookieExpiresAt = new Date(
            capture.liAtCookieExpiry * 1000
          ).toISOString();
        }

        await providerAccountsService.update(providerAccount.id, {
          credentials: mergedCredentials
        });
      });

      response.status(startResult.started ? 202 : 200).json(startResult);
    } catch (error) {
      next(error);
    }
  }
);

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
