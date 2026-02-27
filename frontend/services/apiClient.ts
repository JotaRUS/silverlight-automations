export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken = '';

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

function resolveHeaders(method: string, headers?: HeadersInit): HeadersInit {
  const baseHeaders: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (headers) {
    Object.assign(baseHeaders, headers);
  }
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    baseHeaders['x-csrf-token'] = csrfToken;
  }
  return baseHeaders;
}

export async function apiRequest<TResponse>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: HeadersInit;
  }
): Promise<TResponse> {
  const method = options?.method ?? 'GET';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: resolveHeaders(method, options?.headers),
      body: options?.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Network error — check your connection and try again.');
  }

  if (response.status === 401 || response.status === 403) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return new Promise<TResponse>(() => {});
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    const code = payload.error?.code ?? `http_${response.status}`;
    const message = payload.error?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, code, message, payload.error?.details);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
