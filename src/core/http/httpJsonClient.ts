import { AppError } from '../errors/appError';
import { logProviderCall } from '../logging/observability';
import { logger } from '../logging/logger';
import { clock } from '../time/clock';

interface JsonRequestOptions {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  provider: string;
  operation: string;
  correlationId: string;
}

export async function requestJson<TResponse>(options: JsonRequestOptions): Promise<TResponse> {
  const startedAt = clock.now().getTime();
  const response = await fetch(options.url, {
    method: options.method,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const finishedAt = clock.now().getTime();
  const latencyMs = finishedAt - startedAt;

  let parsedBody: unknown = null;
  try {
    parsedBody = await response.json();
  } catch (error) {
    logger.warn(
      {
        provider: options.provider,
        operation: options.operation,
        correlationId: options.correlationId,
        statusCode: response.status,
        err: error
      },
      'provider-response-not-json'
    );
  }

  logProviderCall(logger, {
    category: 'SYSTEM',
    provider: options.provider,
    operation: options.operation,
    correlationId: options.correlationId,
    latencyMs,
    statusCode: response.status,
    normalizedOutcome: response.ok ? 'success' : 'failure',
    errorClass: response.ok ? undefined : 'http_error'
  });

  if (!response.ok) {
    throw new AppError(`Provider request failed: ${options.provider}`, 502, 'provider_request_failed', {
      provider: options.provider,
      operation: options.operation,
      statusCode: response.status,
      responseBody: parsedBody
    });
  }

  return parsedBody as TResponse;
}
