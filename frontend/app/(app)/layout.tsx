'use client';

import type { PropsWithChildren } from 'react';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/hooks/useAuth';

import { AppProviders } from '../providers';

export default function AppShellLayout({ children }: PropsWithChildren): JSX.Element {
  return (
    <AppProviders>
      <AuthProvider>{children}</AuthProvider>
      <Toaster position="top-center" richColors />
    </AppProviders>
  );
}
