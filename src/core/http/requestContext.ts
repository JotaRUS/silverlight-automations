import { AsyncLocalStorage } from 'node:async_hooks';

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

const HEADER_CORRELATION_ID = 'x-correlation-id';

export interface RequestContextValue {
  correlationId: string;
}

const contextStore = new AsyncLocalStorage<RequestContextValue>();

export function getRequestContext(): RequestContextValue | undefined {
  return contextStore.getStore();
}

export function correlationIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const incomingCorrelationId = request.header(HEADER_CORRELATION_ID);
  const correlationId = incomingCorrelationId?.trim() ?? uuidv4();

  response.setHeader(HEADER_CORRELATION_ID, correlationId);
  contextStore.run({ correlationId }, () => {
    next();
  });
}
