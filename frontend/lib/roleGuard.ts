import type { AuthRole } from '@/types/auth';

export function resolveGuardRedirect(pathname: string, role: AuthRole | null): string | null {
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin' && role !== 'ops') {
      return '/login';
    }
  }

  if (pathname.startsWith('/caller')) {
    if (role !== 'caller') {
      return '/login';
    }
  }

  if (pathname === '/login' && role) {
    return role === 'caller' ? '/caller' : '/admin';
  }

  return null;
}

