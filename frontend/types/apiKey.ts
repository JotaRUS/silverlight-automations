export type ApiKeyScope =
  | 'read:projects'
  | 'read:leads'
  | 'write:projects'
  | 'write:leads'
  | 'admin:providers';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
