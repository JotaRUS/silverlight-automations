import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env';
import { authenticate, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { clearCsrfToken, issueCsrfToken } from '../../core/auth/csrf';
import { signAccessToken, type AuthRole } from '../../core/auth/jwt';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const devLoginRequestSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'ops', 'caller'])
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
