import { randomBytes } from 'node:crypto';

interface CsrfTokenRecord {
  token: string;
  expiresAtEpochMs: number;
}

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const csrfTokensByUserId = new Map<string, CsrfTokenRecord>();

export function issueCsrfToken(userId: string): string {
  const token = randomBytes(24).toString('hex');
  csrfTokensByUserId.set(userId, {
    token,
    expiresAtEpochMs: Date.now() + TOKEN_TTL_MS
  });
  return token;
}

export function verifyCsrfToken(userId: string, token: string): boolean {
  const stored = csrfTokensByUserId.get(userId);
  if (!stored) {
    return false;
  }
  if (stored.expiresAtEpochMs <= Date.now()) {
    csrfTokensByUserId.delete(userId);
    return false;
  }
  return stored.token === token;
}

export function clearCsrfToken(userId: string): void {
  csrfTokensByUserId.delete(userId);
}

