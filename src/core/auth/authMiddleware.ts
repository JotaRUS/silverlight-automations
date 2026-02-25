import type { NextFunction, Request, Response } from 'express';

import type { AuthRole } from './jwt';
import { verifyCsrfToken } from './csrf';
import { AppError } from '../errors/appError';
import { verifyAccessToken } from './jwt';

export interface RequestWithAuth extends Request {
  auth?: {
    userId: string;
    role: AuthRole;
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

export function authenticate(request: Request, _response: Response, next: NextFunction): void {
  const cookies = parseCookieHeader(request.header('cookie'));
  const token = cookies.access_token;
  if (!token) {
    throw new AppError('Unauthorized', 401, 'missing_auth_cookie');
  }

  const payload = verifyAccessToken(token);
  (request as RequestWithAuth).auth = {
    userId: payload.sub,
    role: payload.role
  };

  if (isMutatingMethod(request.method) && !isCsrfExemptPath(request.path)) {
    const csrfToken = request.header('x-csrf-token');
    if (!csrfToken) {
      throw new AppError('Forbidden', 403, 'missing_csrf_token');
    }
    const isValid = verifyCsrfToken(payload.sub, csrfToken);
    if (!isValid) {
      throw new AppError('Forbidden', 403, 'invalid_csrf_token');
    }
  }

  next();
}

export function authorize(roles: AuthRole[]): (request: Request, response: Response, next: NextFunction) => void {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const authRequest = request as RequestWithAuth;
    if (!authRequest.auth) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }
    if (!roles.includes(authRequest.auth.role)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }
    next();
  };
}
