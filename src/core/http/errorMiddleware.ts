import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/appError';
import { logger } from '../logging/logger';
import { getRequestContext } from './requestContext';

export function errorMiddleware(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction
): void {
  void next;
  const context = getRequestContext();
  if (error instanceof AppError) {
    logger.warn(
      {
        correlationId: context?.correlationId,
        errorCode: error.errorCode,
        details: error.details
      },
      error.message
    );

    response.status(error.statusCode).json({
      error: {
        code: error.errorCode,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  logger.error(
    {
      correlationId: context?.correlationId,
      err: error
    },
    'unhandled-error'
  );

  response.status(500).json({
    error: {
      code: 'internal_server_error',
      message: 'An unexpected error occurred.'
    }
  });
}
