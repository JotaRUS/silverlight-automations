import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';

const roleEnum = z.enum(['ADMIN', 'OPS', 'CALLER']);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(6).max(128),
  role: roleEnum.default('CALLER'),
  timezone: z.string().min(1).default('UTC'),
  languageCodes: z.array(z.string()).default(['en']),
  regionIsoCodes: z.array(z.string()).default([])
});

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1).max(200).optional(),
    password: z.string().min(6).max(128).optional(),
    role: roleEnum.optional(),
    timezone: z.string().min(1).optional(),
    languageCodes: z.array(z.string()).optional(),
    regionIsoCodes: z.array(z.string()).optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

function sanitize(caller: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash: _, ...rest } = caller;
  return rest;
}

export const userRoutes = Router();

userRoutes.use(authenticate);
userRoutes.use(authorize(['admin']));

userRoutes.get('/', async (_request, response, next) => {
  try {
    const users = await prisma.caller.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        timezone: true,
        languageCodes: true,
        regionIsoCodes: true,
        allocationStatus: true,
        createdAt: true,
        updatedAt: true
      }
    });
    response.status(200).json(users);
  } catch (error) {
    next(error);
  }
});

userRoutes.get('/:userId', async (request, response, next) => {
  try {
    const user = await prisma.caller.findUnique({
      where: { id: request.params.userId }
    });
    if (!user || user.deletedAt) {
      throw new AppError('User not found', 404, 'user_not_found');
    }
    response.status(200).json(sanitize(user as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

userRoutes.post('/', async (request, response, next) => {
  try {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const existing = await prisma.caller.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      throw new AppError('Email already in use', 409, 'email_conflict');
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.caller.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role as never,
        timezone: parsed.data.timezone,
        languageCodes: parsed.data.languageCodes,
        regionIsoCodes: parsed.data.regionIsoCodes
      }
    });

    response.status(201).json(sanitize(user as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

userRoutes.patch('/:userId', async (request, response, next) => {
  try {
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const existing = await prisma.caller.findUnique({ where: { id: request.params.userId } });
    if (!existing || existing.deletedAt) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    if (parsed.data.email && parsed.data.email !== existing.email) {
      const emailTaken = await prisma.caller.findUnique({ where: { email: parsed.data.email } });
      if (emailTaken) {
        throw new AppError('Email already in use', 409, 'email_conflict');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.email) updateData.email = parsed.data.email;
    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.role) updateData.role = parsed.data.role;
    if (parsed.data.timezone) updateData.timezone = parsed.data.timezone;
    if (parsed.data.languageCodes) updateData.languageCodes = parsed.data.languageCodes;
    if (parsed.data.regionIsoCodes) updateData.regionIsoCodes = parsed.data.regionIsoCodes;
    if (parsed.data.password) {
      updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    }

    const updated = await prisma.caller.update({
      where: { id: request.params.userId },
      data: updateData
    });

    response.status(200).json(sanitize(updated as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

userRoutes.delete('/:userId', async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (auth?.userId === request.params.userId) {
      throw new AppError('Cannot delete your own account', 400, 'self_delete_forbidden');
    }

    const existing = await prisma.caller.findUnique({ where: { id: request.params.userId } });
    if (!existing || existing.deletedAt) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    await prisma.caller.update({
      where: { id: request.params.userId },
      data: { deletedAt: new Date() }
    });

    response.status(200).json({ deleted: true });
  } catch (error) {
    next(error);
  }
});
