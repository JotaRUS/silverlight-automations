import type { NextFunction, Request, Response } from 'express';

import { prisma } from '../../db/client';
import { logger } from '../logging/logger';
import type { AuthRole } from './jwt';
import { fromDbApiKeyScopes, hashApiKey, type PlatformApiKeyScope } from './apiKeys';
import { verifyCsrfToken } from './csrf';
import { AppError } from '../errors/appError';
import { verifyAccessToken } from './jwt';

export interface RequestWithAuth extends Request {
  auth?: {
    userId: string;
    role: AuthRole;
    authType: 'session' | 'api_key';
    apiKeyId?: string;
    scopes?: PlatformApiKeyScope[];
  };
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, chunk) => {
      const separatorIndex = chunk.indexOf('=');
      if (separatorIndex <= 0) {
        return accumulator;
      }
      const key = chunk.slice(0, separatorIndex).trim();
      const value = chunk.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function isMutatingMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isCsrfExemptPath(path: string): boolean {
  return path.startsWith('/api/v1/auth/login') || path.startsWith('/api/v1/auth/logout');
}

function getProvidedApiKey(request: Request): string | null {
  const directApiKey = request.header('x-api-key');
  if (directApiKey && directApiKey.trim().length > 0) {
    return directApiKey.trim();
  }

  const authorization = request.header('authorization');
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
    return token.trim();
  }

  return null;
}

function getApiKeyRoutePolicy(
  request: Request
): { enabled: boolean; requiredScopes: PlatformApiKeyScope[] } {
  const fullPath = `${request.baseUrl}${request.path}`;

  if (fullPath === '/api/v1/auth/me') {
    return { enabled: true, requiredScopes: [] };
  }

  if (fullPath.startsWith('/api/v1/projects')) {
    return {
      enabled: true,
      requiredScopes: [isMutatingMethod(request.method) ? 'write:projects' : 'read:projects']
    };
  }

  if (fullPath.startsWith('/api/v1/admin/leads')) {
    return {
      enabled: true,
      requiredScopes: [isMutatingMethod(request.method) ? 'write:leads' : 'read:leads']
    };
  }

  if (fullPath.startsWith('/api/v1/providers')) {
    return {
      enabled: true,
      requiredScopes: ['admin:providers']
    };
  }

  return { enabled: false, requiredScopes: [] };
}

export function authenticate(request: Request, response: Response, next: NextFunction): void {
  void (async () => {
    const rawApiKey = getProvidedApiKey(request);
    if (rawApiKey) {
      const keyHash = hashApiKey(rawApiKey);
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: {
          caller: {
            select: {
              id: true,
              role: true,
              deletedAt: true
            }
          }
        }
      });

      if (!apiKey || !apiKey.caller || apiKey.caller.deletedAt) {
        throw new AppError('Unauthorized', 401, 'invalid_api_key');
      }
      if (apiKey.revokedAt) {
        throw new AppError('Unauthorized', 401, 'api_key_revoked');
      }
      if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
        throw new AppError('Unauthorized', 401, 'api_key_expired');
      }

      const routePolicy = getApiKeyRoutePolicy(request);
      if (!routePolicy.enabled) {
        throw new AppError(
          'This route does not accept platform API keys',
          403,
          'api_key_route_not_enabled'
        );
      }

      const scopes = fromDbApiKeyScopes(apiKey.scopes);
      const missingScopes = routePolicy.requiredScopes.filter((scope) => !scopes.includes(scope));
      if (missingScopes.length > 0) {
        throw new AppError('Forbidden: API key scope missing', 403, 'api_key_scope_missing', {
          requiredScopes: routePolicy.requiredScopes,
          missingScopes
        });
      }

      (request as RequestWithAuth).auth = {
        userId: apiKey.caller.id,
        role: apiKey.caller.role.toLowerCase() as AuthRole,
        authType: 'api_key',
        apiKeyId: apiKey.id,
        scopes
      };

      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() }
      });

      next();
      return;
    }

    const cookies = parseCookieHeader(request.header('cookie'));
    const token = cookies.access_token;
    if (!token) {
      throw new AppError('Unauthorized', 401, 'missing_auth_cookie');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      response.clearCookie('access_token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
      });
      throw new AppError('Unauthorized', 401, 'invalid_or_expired_token');
    }

    (request as RequestWithAuth).auth = {
      userId: payload.sub,
      role: payload.role,
      authType: 'session'
    };

    if (isMutatingMethod(request.method) && !isCsrfExemptPath(request.path)) {
      const csrfToken = request.header('x-csrf-token');
      if (!csrfToken) {
        logger.warn(
          { path: request.path, method: request.method, userId: payload.sub },
          'auth-403-missing-csrf'
        );
        throw new AppError('Forbidden: CSRF token required', 403, 'missing_csrf_token');
      }
      const isValid = verifyCsrfToken(payload.sub, csrfToken);
      if (!isValid) {
        logger.warn(
          { path: request.path, method: request.method, userId: payload.sub },
          'auth-403-invalid-csrf'
        );
        throw new AppError('Forbidden: Invalid CSRF token', 403, 'invalid_csrf_token');
      }
    }

    next();
  })().catch(next);
}

export function authorize(roles: AuthRole[]): (request: Request, response: Response, next: NextFunction) => void {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const authRequest = request as RequestWithAuth;
    if (!authRequest.auth) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }
    if (!roles.includes(authRequest.auth.role)) {
      logger.warn(
        {
          path: request.path,
          method: request.method,
          userId: authRequest.auth.userId,
          role: authRequest.auth.role,
          requiredRoles: roles
        },
        'auth-403-forbidden-role'
      );
      throw new AppError(
        `Forbidden: role "${authRequest.auth.role}" cannot perform this action (required: ${roles.join(', ')})`,
        403,
        'forbidden'
      );
    }
    next();
  };
}
