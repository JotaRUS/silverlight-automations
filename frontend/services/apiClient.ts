export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
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
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: resolveHeaders(method, options?.headers),
    body: options?.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    throw new Error(payload.error?.message ?? payload.error?.code ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
