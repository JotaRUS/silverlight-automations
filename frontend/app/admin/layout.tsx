'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { updateProfile } from '@/services/authService';

const sidebarLinks = [
  { href: '/admin', icon: 'grid_view', label: 'Dashboard' },
  { href: '/admin/providers', icon: 'corporate_fare', label: 'Providers' },
  { href: '/admin/projects', icon: 'work', label: 'Projects' },
  { href: '/admin/leads', icon: 'contact_support', label: 'Leads' },
  { href: '/admin/outreach', icon: 'campaign', label: 'Outreach' },
  { href: '/admin/screening', icon: 'fact_check', label: 'Screening' },
  { href: '/admin/calls', icon: 'podium', label: 'Calls' },
  { href: '/admin/ranking', icon: 'bar_chart', label: 'Ranking' },
  { href: '/admin/observability', icon: 'sensors', label: 'Observability' },
  { href: '/admin/users', icon: 'group', label: 'Users' },
  { href: '/admin/api-keys', icon: 'vpn_key', label: 'API Keys' },
  { href: '/admin/api-docs', icon: 'menu_book', label: 'API Docs' }
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
  const { logout, user, loading, refresh } = useAuth();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const [formName, setFormName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  const closeMenu = useCallback(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, []);

  const openSettings = useCallback(() => {
    closeMenu();
    setFormName(user?.name ?? '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFormError('');
    setFormSuccess('');
    setSettingsOpen(true);
  }, [user]);

  const handleLogout = useCallback(() => {
    closeMenu();
    void logout().then(() => {
      router.replace('/login');
    });
  }, [logout, router]);

  const handleSave = async (): Promise<void> => {
    setFormError('');
    setFormSuccess('');
    if (newPassword && newPassword !== confirmPassword) {
      setFormError('New passwords do not match');
      return;
    }
    const payload: Record<string, string> = {};
    if (formName && formName !== user?.name) payload.name = formName;
    if (newPassword) {
      if (!currentPassword) {
        setFormError('Current password is required to change password');
        return;
      }
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }
    if (Object.keys(payload).length === 0) {
      setFormError('No changes to save');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(payload);
      await refresh();
      setFormSuccess('Profile updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-light">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <div />;
  }

  const initial = user.name?.charAt(0)?.toUpperCase() ?? user.email?.charAt(0)?.toUpperCase() ?? 'A';

  return (
    <div className="min-h-screen bg-bg-light">
      {/* Desktop icon sidebar */}
      <div className="hidden md:block fixed left-0 top-0 bottom-0 w-[4.5rem] bg-white border-r border-slate-200 z-40 py-4 overflow-y-auto">
        <div className="flex flex-col items-center gap-3 h-full">
          <Link href="/admin" className="size-10 bg-primary rounded-lg flex items-center justify-center text-white shrink-0">
            <span className="material-symbols-outlined">hub</span>
          </Link>
          <nav className="flex flex-col gap-1 mt-1">
            {sidebarLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                title={link.label}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors',
                  isActive(pathname, link.href)
                    ? 'text-primary bg-primary/10'
                    : 'text-slate-400 hover:text-primary hover:bg-slate-50'
                )}
              >
                <span className="material-symbols-outlined text-xl">{link.icon}</span>
                <span className="text-[9px] font-semibold leading-tight">{link.label}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-1 shrink-0">
            <Link
              href="/admin/help"
              title="Help"
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors',
                isActive(pathname, '/admin/help')
                  ? 'text-primary bg-primary/10'
                  : 'text-slate-400 hover:text-primary hover:bg-slate-50'
              )}
            >
              <span className="material-symbols-outlined text-xl">help_outline</span>
              <span className="text-[9px] font-semibold leading-tight">Help</span>
            </Link>
            <button
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-slate-400 hover:text-primary transition-colors"
              title="Logout"
              onClick={handleLogout}
            >
              <span className="material-symbols-outlined text-xl">logout</span>
              <span className="text-[9px] font-semibold leading-tight">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between md:pl-[5.5rem]">
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
          <NotificationBell />
          <details ref={detailsRef} className="relative">
            <summary
              className="size-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border border-primary/30 text-primary text-xs font-bold cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all list-none [&::-webkit-details-marker]:hidden"
            >
              {initial}
            </summary>
            <div className="absolute right-0 top-10 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1 z-[9999]">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
              <button
                onClick={openSettings}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-lg text-slate-400">settings</span>
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                Log out
              </button>
            </div>
          </details>
        </div>
      </header>

      {/* Main content */}
      <main className="md:pl-[4.5rem] pb-20 md:pb-0">
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

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl mx-4">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold">Account Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <Input value={user.email ?? ''} disabled className="bg-slate-50 text-slate-500 cursor-not-allowed" />
                <p className="mt-1 text-xs text-slate-400">Email cannot be changed</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Your name" />
              </div>
              <hr className="border-slate-100" />
              <p className="text-sm font-medium text-slate-700">Change Password</p>
              <div>
                <label className="mb-1 block text-sm text-slate-600">Current Password</label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">New Password</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">Confirm New Password</label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              {formSuccess && <p className="text-sm text-emerald-600">{formSuccess}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button onClick={() => setSettingsOpen(false)} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
