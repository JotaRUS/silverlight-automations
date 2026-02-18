import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../../config/env';
import { AppError } from '../errors/appError';

export const authRoleSchema = z.enum(['admin', 'ops', 'caller']);
export type AuthRole = z.infer<typeof authRoleSchema>;

export interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  role: AuthRole;
}

export function signAccessToken(userId: string, role: AuthRole): string {
  return jwt.sign(
    { role },
    env.JWT_SECRET,
    {
      subject: userId,
      audience: env.JWT_AUDIENCE,
      issuer: env.JWT_ISSUER,
      algorithm: 'HS256',
      expiresIn: env.JWT_ACCESS_TOKEN_TTL_SECONDS
    }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      audience: env.JWT_AUDIENCE,
      issuer: env.JWT_ISSUER,
      algorithms: ['HS256']
    });

    const parsed = z
      .object({
        sub: z.string().min(1),
        role: authRoleSchema
      })
      .parse(decoded);

    return parsed;
  } catch (error) {
    throw new AppError('Unauthorized', 401, 'unauthorized', {
      reason: 'token_validation_failed',
      cause: error instanceof Error ? error.message : 'unknown'
    });
  }
}
