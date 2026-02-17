import type { NextFunction, Request, Response } from 'express';

import type { AuthRole } from './jwt';
import { AppError } from '../errors/appError';
import { verifyAccessToken } from './jwt';

export interface RequestWithAuth extends Request {
  auth?: {
    userId: string;
    role: AuthRole;
  };
}

export function authenticate(request: Request, _response: Response, next: NextFunction): void {
  const authorizationHeader = request.header('authorization');
  if (!authorizationHeader) {
    throw new AppError('Unauthorized', 401, 'missing_authorization_header');
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Unauthorized', 401, 'invalid_authorization_header');
  }

  const payload = verifyAccessToken(token);
  (request as RequestWithAuth).auth = {
    userId: payload.sub,
    role: payload.role
  };
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
