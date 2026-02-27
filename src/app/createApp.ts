import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { API_PREFIX } from '../config/constants';
import { openApiSpec } from '../api/openapi/openApiSpec';
import { authenticate, authorize, type RequestWithAuth } from '../core/auth/authMiddleware';
import { errorMiddleware } from '../core/http/errorMiddleware';
import type { RequestWithRawBody } from '../core/http/rawBody';
import { correlationIdMiddleware, getRequestContext } from '../core/http/requestContext';
import { logger } from '../core/logging/logger';
import { authRoutes } from '../api/routes/authRoutes';
import { systemRoutes } from '../api/routes/systemRoutes';
import { webhookRoutes } from '../api/routes/webhookRoutes';
import { adminRoutes } from '../modules/admin/adminRoutes';
import { callersRoutes } from '../modules/callers/callersRoutes';
import { callAllocationRoutes } from '../modules/call-allocation/callAllocationRoutes';
import { documentationGeneratorRoutes } from '../modules/documentation-generator/documentationGeneratorRoutes';
import { jobTitleDiscoveryRoutes } from '../modules/job-title-engine/jobTitleDiscoveryRoutes';
import { outreachRoutes } from '../modules/outreach/outreachRoutes';
import { providerAccountRoutes } from '../modules/providers/providerAccountRoutes';
import { projectsRoutes } from '../modules/projects/projectsRoutes';
import { screeningRoutes } from '../modules/screening/screeningRoutes';
import { userRoutes } from '../modules/users/userRoutes';

export function createApp(): Express {
  const app = express();
  const authRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30
  });

  app.use(correlationIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      customProps: () => ({
        correlationId: getRequestContext()?.correlationId
      })
    })
  );
  app.use(helmet());
  app.use(cors());
  app.use(
    express.json({
      limit: '1mb',
      verify: (request, _response, buffer) => {
        (request as RequestWithRawBody).rawBody = buffer.toString('utf-8');
      }
    })
  );
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 300
    })
  );

  app.use(`${API_PREFIX}/system`, systemRoutes);
  app.get(`${API_PREFIX}/openapi.json`, (_request, response) => {
    response.status(200).json(openApiSpec);
  });
  app.use(`${API_PREFIX}/auth`, authRateLimiter, authRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);
  app.use(`${API_PREFIX}/projects`, projectsRoutes);
  app.use(`${API_PREFIX}/callers`, callersRoutes);
  app.use(`${API_PREFIX}/call-tasks`, callAllocationRoutes);
  app.use(`${API_PREFIX}/job-title-discovery`, jobTitleDiscoveryRoutes);
  app.use(`${API_PREFIX}/documentation`, documentationGeneratorRoutes);
  app.use(`${API_PREFIX}/outreach`, outreachRoutes);
  app.use(`${API_PREFIX}/providers`, providerAccountRoutes);
  app.use(`${API_PREFIX}/screening`, screeningRoutes);
  app.use(`${API_PREFIX}/users`, userRoutes);
  app.use('/webhooks', webhookRoutes);

  app.get(`${API_PREFIX}/auth/me`, authenticate, async (request, response, next) => {
    try {
      const authRequest = request as RequestWithAuth;
      let name: string | null = null;
      let email: string | null = null;
      try {
        const caller = await import('../db/client').then((m) =>
          m.prisma.caller.findUnique({ where: { id: authRequest.auth?.userId } })
        );
        name = caller?.name ?? null;
        email = caller?.email ?? null;
      } catch {
        // DB unavailable (e.g. in test mode with dev login); return JWT claims only
      }
      response.status(200).json({
        userId: authRequest.auth?.userId,
        role: authRequest.auth?.role,
        name,
        email
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(`${API_PREFIX}/admin/ping`, authenticate, authorize(['admin']), (_request, response) => {
    response.status(200).json({
      status: 'admin-ok'
    });
  });

  app.use(errorMiddleware);

  return app;
}
