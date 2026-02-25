import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { AuthRole } from './types/auth';
import { resolveGuardRedirect } from './lib/roleGuard';

interface JwtPayload {
  role?: AuthRole;
}

function decodeJwtPayload(token: string | undefined): JwtPayload | null {
  if (!token) {
    return null;
  }
  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }
  try {
    const payloadRaw = Buffer.from(segments[1], 'base64url').toString('utf8');
    return JSON.parse(payloadRaw) as JwtPayload;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest): NextResponse {
  const token = request.cookies.get('access_token')?.value;
  const payload = decodeJwtPayload(token);
  const pathname = request.nextUrl.pathname;

  const redirectTarget = resolveGuardRedirect(pathname, payload?.role ?? null);
  if (redirectTarget) {
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/caller/:path*', '/login']
};

