'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const sidebarLinks = [
  { href: '/admin', icon: 'grid_view', label: 'Dashboard' },
  { href: '/admin/providers', icon: 'corporate_fare', label: 'Providers' },
  { href: '/admin/projects', icon: 'work', label: 'Projects' },
  { href: '/admin/leads', icon: 'contact_support', label: 'Leads' },
  { href: '/admin/outreach', icon: 'campaign', label: 'Outreach' },
  { href: '/admin/screening', icon: 'fact_check', label: 'Screening' },
  { href: '/admin/calls', icon: 'podium', label: 'Calls' },
  { href: '/admin/ranking', icon: 'bar_chart', label: 'Ranking' },
  { href: '/admin/observability', icon: 'sensors', label: 'Observability' }
];

const mobileLinks = [
  { href: '/admin', icon: 'home', label: 'Home' },
  { href: '/admin/projects', icon: 'work', label: 'Projects' },
  { href: '/admin/observability', icon: 'settings_input_component', label: 'System' },
  { href: '/admin/providers', icon: 'account_circle', label: 'Profile' }
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname.startsWith(href);
}

export default function AdminLayout({ children }: PropsWithChildren): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-bg-light">
      {/* Desktop icon sidebar */}
      <div className="hidden md:block fixed left-0 top-0 bottom-0 w-16 bg-white border-r border-slate-200 z-40 py-6">
        <div className="flex flex-col items-center gap-6 h-full">
          <Link href="/admin" className="size-10 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined">hub</span>
          </Link>
          <nav className="flex flex-col gap-2 mt-2">
            {sidebarLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                className={cn(
                  'p-2 rounded-xl transition-colors',
                  isActive(pathname, link.href)
                    ? 'text-primary bg-primary/10'
                    : 'text-slate-400 hover:text-primary hover:bg-slate-50'
                )}
              >
                <span className="material-symbols-outlined">{link.icon}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-4">
            <button
              className="p-2 text-slate-400 hover:text-primary transition-colors"
              title="Logout"
              onClick={() => {
                void logout().then(() => router.push('/login'));
              }}
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between md:pl-20">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary rounded-lg flex items-center justify-center text-white md:hidden">
            <span className="material-symbols-outlined">hub</span>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Expert Sourcing</h1>
            <p className="text-xs text-slate-500">Admin Automation Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-full relative">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white" />
          </button>
          <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border border-primary/30 text-primary text-xs font-bold">
            {user?.userId?.charAt(0)?.toUpperCase() ?? 'A'}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="md:pl-16 pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto p-4">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 z-50 md:hidden flex justify-around items-center">
        {mobileLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'flex flex-col items-center gap-1',
              isActive(pathname, link.href) ? 'text-primary' : 'text-slate-500'
            )}
          >
            <span className="material-symbols-outlined">{link.icon}</span>
            <span className="text-[10px] font-bold">{link.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
