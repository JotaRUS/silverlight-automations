'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const links = [
  { href: '/admin/providers', label: 'Providers' },
  { href: '/admin/projects', label: 'Projects' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/outreach', label: 'Outreach' },
  { href: '/admin/screening', label: 'Screening' },
  { href: '/admin/calls', label: 'Call Board' },
  { href: '/admin/ranking', label: 'Ranking' },
  { href: '/admin/observability', label: 'Observability' }
];

export default function AdminLayout({ children }: PropsWithChildren): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r border-slate-200 bg-white p-4">
        <div className="mb-4">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="text-sm font-semibold">{user?.userId ?? 'unknown'}</p>
          <p className="text-xs text-slate-500">{user?.role ?? '-'}</p>
        </div>
        <nav className="space-y-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'block rounded px-3 py-2 text-sm',
                pathname.startsWith(link.href) ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Button
          variant="secondary"
          className="mt-6 w-full"
          onClick={() => {
            void logout().then(() => router.push('/login'));
          }}
        >
          Logout
        </Button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
