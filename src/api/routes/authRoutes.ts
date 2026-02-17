import { Router } from 'express';
import { z } from 'zod';

import { signAccessToken, authRoleSchema } from '../../core/auth/jwt';
import { AppError } from '../../core/errors/appError';

const tokenRequestSchema = z.object({
  userId: z.string().min(1),
  role: authRoleSchema
});

export const authRoutes = Router();

authRoutes.post('/token', (request, response) => {
  const parsed = tokenRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new AppError('Invalid token payload', 400, 'invalid_payload', parsed.error.flatten());
  }

  const token = signAccessToken(parsed.data.userId, parsed.data.role);
  response.status(200).json({
    accessToken: token,
    tokenType: 'Bearer'
  });
});
