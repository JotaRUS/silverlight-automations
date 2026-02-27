export type AuthRole = 'admin' | 'ops' | 'caller';

export interface AuthUser {
  userId: string;
  role: AuthRole;
  name?: string;
  email?: string;
}
