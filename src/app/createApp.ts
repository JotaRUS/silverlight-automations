import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { API_PREFIX } from '../config/constants';
import { authenticate, authorize, type RequestWithAuth } from '../core/auth/authMiddleware';
import { errorMiddleware } from '../core/http/errorMiddleware';
import type { RequestWithRawBody } from '../core/http/rawBody';
import { correlationIdMiddleware, getRequestContext } from '../core/http/requestContext';
import { logger } from '../core/logging/logger';
import { authRoutes } from '../api/routes/authRoutes';
import { systemRoutes } from '../api/routes/systemRoutes';
import { webhookRoutes } from '../api/routes/webhookRoutes';
import { callersRoutes } from '../modules/callers/callersRoutes';
import { callAllocationRoutes } from '../modules/call-allocation/callAllocationRoutes';
import { jobTitleDiscoveryRoutes } from '../modules/job-title-engine/jobTitleDiscoveryRoutes';
import { outreachRoutes } from '../modules/outreach/outreachRoutes';
import { projectsRoutes } from '../modules/projects/projectsRoutes';

export function createApp(): Express {
  const app = express();

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
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/projects`, projectsRoutes);
  app.use(`${API_PREFIX}/callers`, callersRoutes);
  app.use(`${API_PREFIX}/call-tasks`, callAllocationRoutes);
  app.use(`${API_PREFIX}/job-title-discovery`, jobTitleDiscoveryRoutes);
  app.use(`${API_PREFIX}/outreach`, outreachRoutes);
  app.use('/webhooks', webhookRoutes);

  app.get(`${API_PREFIX}/auth/me`, authenticate, (request, response) => {
    const authRequest = request as RequestWithAuth;
    response.status(200).json({
      userId: authRequest.auth?.userId,
      role: authRequest.auth?.role
    });
  });

  app.get(`${API_PREFIX}/admin/ping`, authenticate, authorize(['admin']), (_request, response) => {
    response.status(200).json({
      status: 'admin-ok'
    });
  });

  app.use(errorMiddleware);

  return app;
}
