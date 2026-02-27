import { AppError } from '../errors/appError';
import { logProviderCall } from '../logging/observability';
import { logger } from '../logging/logger';
import { clock } from '../time/clock';

interface JsonRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  contentType?: string;
  provider: string;
  operation: string;
  correlationId: string;
}

export async function requestJson<TResponse>(options: JsonRequestOptions): Promise<TResponse> {
  const isFormEncoded = options.contentType === 'application/x-www-form-urlencoded';

  let encodedBody: string | undefined;
  if (isFormEncoded && options.body && typeof options.body === 'object') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.body as Record<string, unknown>)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    encodedBody = params.toString();
  } else if (typeof options.body === 'string') {
    encodedBody = options.body;
  } else if (options.body !== undefined) {
    encodedBody = JSON.stringify(options.body);
  }

  const headers: Record<string, string> = {
    ...(options.headers ?? {})
  };
  if (!headers['content-type'] && encodedBody) {
    headers['content-type'] = options.contentType ?? 'application/json';
  }

  const startedAt = clock.now().getTime();
  const response = await fetch(options.url, {
    method: options.method,
    headers,
    body: encodedBody
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
