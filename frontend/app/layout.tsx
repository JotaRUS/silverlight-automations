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
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-display">
        <AppProviders>
          <AuthProvider>{children}</AuthProvider>
        </AppProviders>
      </body>
    </html>
  );
}
