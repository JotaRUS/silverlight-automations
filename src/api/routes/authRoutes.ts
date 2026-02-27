import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { clearCsrfToken, issueCsrfToken } from '../../core/auth/csrf';
import { signAccessToken, type AuthRole } from '../../core/auth/jwt';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function mapDbRole(dbRole: string): AuthRole {
  const lower = dbRole.toLowerCase();
  if (lower === 'admin' || lower === 'ops' || lower === 'caller') {
    return lower as AuthRole;
  }
  return 'caller';
}

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const authRoutes = Router();

authRoutes.post('/login', async (request, response, next) => {
  try {
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
