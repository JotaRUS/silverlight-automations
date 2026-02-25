import { describe, expect, it } from 'vitest';

import { resolveGuardRedirect } from '@/lib/roleGuard';

describe('resolveGuardRedirect', () => {
  it('redirects unauthenticated admin route access', () => {
    expect(resolveGuardRedirect('/admin/providers', null)).toBe('/login');
  });

  it('allows ops access to admin route', () => {
    expect(resolveGuardRedirect('/admin/providers', 'ops')).toBeNull();
  });

  it('redirects non-caller from caller route', () => {
    expect(resolveGuardRedirect('/caller', 'admin')).toBe('/login');
  });

  it('redirects authenticated user away from login', () => {
    expect(resolveGuardRedirect('/login', 'caller')).toBe('/caller');
  });
});
