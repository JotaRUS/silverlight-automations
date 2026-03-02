'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationsRead,
  type Notification
} from '@/services/notificationService';

const SEVERITY_ICON: Record<string, string> = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

const SEVERITY_COLOR: Record<string, string> = {
  ERROR: 'text-red-500',
  WARNING: 'text-amber-500',
  INFO: 'text-blue-500'
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadUnreadCount = useCallback(async () => {
    try {
      const { count } = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // silent
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications({ limit: 30 });
      setNotifications(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUnreadCount();
    const interval = setInterval(() => void loadUnreadCount(), 30_000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  const handleRealtimeNotification = useCallback(
    (payload: Notification) => {
      setUnreadCount((c) => c + 1);
      setNotifications((prev) => [payload, ...prev].slice(0, 30));

      const toastFn =
        payload.severity === 'ERROR'
          ? toast.error
          : payload.severity === 'WARNING'
            ? toast.warning
            : toast.info;
      toastFn(payload.title, { description: payload.message, duration: 6000 });
    },
    []
  );

  useSocket<Notification>('/admin', 'notification.created', handleRealtimeNotification);

  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
  }, [open, loadNotifications]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
    }
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // silent
    }
  }, []);

  const handleClickNotification = useCallback(async (n: Notification) => {
    if (!n.readAt) {
      try {
        await markNotificationsRead([n.id]);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // silent
      }
    }
  }, []);

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 text-slate-600 hover:bg-slate-100 rounded-full relative"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 border-2 border-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-96 max-h-[28rem] rounded-xl border border-slate-200 bg-white shadow-xl z-[9999] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAllRead()}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                Loading...
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <span className="material-symbols-outlined text-3xl mb-1">notifications_off</span>
                <p className="text-sm">No notifications yet</p>
              </div>
            )}

            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void handleClickNotification(n)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3',
                  !n.readAt && 'bg-blue-50/40'
                )}
              >
                <span
                  className={cn(
                    'material-symbols-outlined text-lg mt-0.5 shrink-0',
                    SEVERITY_COLOR[n.severity] ?? 'text-slate-400'
                  )}
                >
                  {SEVERITY_ICON[n.severity] ?? 'info'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                    {!n.readAt && (
                      <span className="size-2 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
