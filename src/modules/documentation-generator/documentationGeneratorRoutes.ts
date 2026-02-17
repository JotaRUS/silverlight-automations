import { Router } from 'express';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { prisma } from '../../db/client';
import { DocumentationGeneratorService } from './documentationGeneratorService';

const documentationGeneratorService = new DocumentationGeneratorService(prisma);

export const documentationGeneratorRoutes = Router();

documentationGeneratorRoutes.use(authenticate, authorize(['admin', 'ops']));

documentationGeneratorRoutes.post('/generate', async (_request, response, next) => {
  try {
    await documentationGeneratorService.generate();
    response.status(200).json({
      generated: true
    });
  } catch (error) {
    next(error);
  }
});
