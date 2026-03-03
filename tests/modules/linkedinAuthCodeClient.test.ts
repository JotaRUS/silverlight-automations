import { describe, expect, it } from 'vitest';

import {
  buildLinkedInAuthorizeUrl,
  buildLinkedInRedirectUri
} from '../../src/integrations/sales-nav/linkedinAuthCodeClient';

describe('linkedinAuthCodeClient helpers', () => {
  it('builds canonical LinkedIn OAuth callback redirect URI', () => {
    expect(buildLinkedInRedirectUri('https://silverlight-automations.siblingssoftware.com.ar')).toBe(
      'https://silverlight-automations.siblingssoftware.com.ar/api/v1/auth/linkedin/callback'
    );
    expect(buildLinkedInRedirectUri('https://silverlight-automations.siblingssoftware.com.ar/')).toBe(
      'https://silverlight-automations.siblingssoftware.com.ar/api/v1/auth/linkedin/callback'
    );
  });

  it('builds LinkedIn authorize URL with encoded query params', () => {
    const authorizeUrl = buildLinkedInAuthorizeUrl({
      clientId: 'client-id-123',
      redirectUri: 'https://silverlight-automations.siblingssoftware.com.ar/api/v1/auth/linkedin/callback',
      state: 'state-abc',
      scopes: ['r_liteprofile', 'w_member_social']
    });
    const parsed = new URL(authorizeUrl);
    expect(parsed.origin).toBe('https://www.linkedin.com');
    expect(parsed.pathname).toBe('/oauth/v2/authorization');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-id-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://silverlight-automations.siblingssoftware.com.ar/api/v1/auth/linkedin/callback'
    );
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('scope')).toBe('r_liteprofile w_member_social');
  });
});
