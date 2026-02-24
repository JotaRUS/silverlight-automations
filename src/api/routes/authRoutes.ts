import { Router } from 'express';
import { z } from 'zod';

import { authenticate, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { clearCsrfToken, issueCsrfToken } from '../../core/auth/csrf';
import { signAccessToken, authRoleSchema } from '../../core/auth/jwt';
import { AppError } from '../../core/errors/appError';

const loginRequestSchema = z.object({
  userId: z.string().min(1),
  role: authRoleSchema
});

export const authRoutes = Router();

authRoutes.post('/login', (request, response) => {
  const parsed = loginRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new AppError('Invalid token payload', 400, 'invalid_payload', parsed.error.flatten());
  }

  const token = signAccessToken(parsed.data.userId, parsed.data.role);
  response.cookie('access_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  response.status(200).json({
    authenticated: true,
    role: parsed.data.role,
    userId: parsed.data.userId
  });
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
