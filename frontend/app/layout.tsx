import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/hooks/useAuth';

import './globals.css';
import { AppProviders } from './providers';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://silverlight-automations.siblingssoftware.com.ar';

export const metadata: Metadata = {
  title: 'Silverlight — Expert Sourcing Platform',
  description:
    'Automated expert sourcing, outreach and screening platform. Find, enrich and engage the right experts at scale.',
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: 'Silverlight — Expert Sourcing Platform',
    description:
      'Automated expert sourcing, outreach and screening platform. Find, enrich and engage the right experts at scale.',
    url: BASE_URL,
    siteName: 'Silverlight',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Silverlight Expert Sourcing Platform'
      }
    ],
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Silverlight — Expert Sourcing Platform',
    description:
      'Automated expert sourcing, outreach and screening platform. Find, enrich and engage the right experts at scale.',
    images: ['/og-image.jpg']
  }
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
          <Toaster position="top-center" richColors />
        </AppProviders>
      </body>
    </html>
  );
}
