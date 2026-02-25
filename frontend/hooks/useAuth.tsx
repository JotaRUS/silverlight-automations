'use client';

import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import type { AuthRole, AuthUser } from '@/types/auth';
import { fetchCsrfToken, fetchMe, login as loginRequest, logout as logoutRequest } from '@/services/authService';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (payload: { userId: string; role: AuthRole }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async (): Promise<void> => {
    try {
      const me = await fetchMe();
      setUser(me);
      await fetchCsrfToken();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (payload) => {
        await loginRequest(payload);
        await refresh();
      },
      logout: async () => {
        await logoutRequest();
        setUser(null);
      },
      refresh
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
