import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';

import { AuthProvider } from '@/hooks/useAuth';

import './globals.css';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: 'Expert Sourcing Admin',
  description: 'Operations UI for sourcing automation'
};

export default function RootLayout({ children }: PropsWithChildren): JSX.Element {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <AuthProvider>{children}</AuthProvider>
        </AppProviders>
      </body>
    </html>
  );
}
