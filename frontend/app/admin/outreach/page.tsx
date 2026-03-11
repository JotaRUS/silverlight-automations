'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import { fetchOutreachThreads, updateOutreachThread } from '@/services/adminService';
import { listProjects } from '@/services/projectService';

const CHANNELS: { value: string; label: string }[] = [
  { value: 'EMAIL', label: 'Email (SendGrid)' },
  { value: 'SMS', label: 'SMS (Twilio)' },
  { value: 'VOICEMAIL', label: 'Voicemail (Twilio)' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'WHATSAPP', label: 'WhatsApp (2Chat)' },
  { value: 'PHONE', label: 'Phone (Yay.com)' },
  { value: 'RESPONDIO', label: 'Respond.io' },
  { value: 'IMESSAGE', label: 'iMessage (Twilio)' },
  { value: 'LINE', label: 'LINE' },
  { value: 'WECHAT', label: 'WeChat' },
  { value: 'VIBER', label: 'Viber' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'KAKAOTALK', label: 'KakaoTalk' }
];

type ThreadStatus = 'OPEN' | 'CLOSED' | 'ARCHIVED';

interface OutreachThread {
  id: string;
  channel: string;
  status: ThreadStatus;
  replied: boolean;
  expertId: string;
  projectId: string;
  updatedAt: string;
  firstContactAt?: string;
  lastMessageAt?: string;
  expert?: { fullName?: string; email?: string };
  messages?: { body?: string; createdAt?: string; direction?: string; status?: string }[];
}

function channelIcon(channel: string): string {
  const map: Record<string, string> = {
    EMAIL: 'mail', LINKEDIN: 'share', WHATSAPP: 'chat', PHONE: 'call',
    SMS: 'sms', RESPONDIO: 'forum', IMESSAGE: 'message', LINE: 'chat_bubble',
    WECHAT: 'chat_bubble', VIBER: 'chat_bubble', TELEGRAM: 'send',
    KAKAOTALK: 'chat_bubble', VOICEMAIL: 'voicemail'
  };
  return map[channel] ?? 'campaign';
}

function threadStatusStyle(status: string): string {
  switch (status) {
    case 'OPEN': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'CLOSED': return 'text-slate-600 bg-slate-50 border-slate-200';
    case 'ARCHIVED': return 'text-amber-700 bg-amber-50 border-amber-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

function formatRelative(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const THREAD_STATUS_OPTIONS: { value: ThreadStatus; label: string; icon: string }[] = [
  { value: 'OPEN', label: 'Open', icon: 'radio_button_checked' },
  { value: 'CLOSED', label: 'Closed', icon: 'check_circle' },
  { value: 'ARCHIVED', label: 'Archived', icon: 'archive' }
];

function ThreadActions({
  thread,
  onStatusChange
}: {
  thread: OutreachThread;
  onStatusChange: (id: string, status: ThreadStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <span className="material-symbols-outlined text-xl">more_vert</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-44 rounded-xl bg-white shadow-lg border border-slate-200 py-1 text-sm">
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider">Thread Status</p>
            {THREAD_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                disabled={thread.status === opt.value}
                onClick={() => {
                  onStatusChange(thread.id, opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors ${thread.status === opt.value ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className="material-symbols-outlined text-base">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OutreachPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState<ThreadStatus | ''>('');
  const [refreshNonce, setRefreshNonce] = useState(0);

  useSocket('/admin', 'outreach.thread.updated', () => setRefreshNonce((v) => v + 1));
  useSocket('/admin', 'outreach.reply.received', () => setRefreshNonce((v) => v + 1));

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  const threadsQuery = useQuery({
    queryKey: ['outreach-threads', selectedProjectId, refreshNonce],
    queryFn: () => fetchOutreachThreads(selectedProjectId || undefined)
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ThreadStatus }) =>
      updateOutreachThread(id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outreach-threads'] });
    }
  });

  const handleStatusChange = useCallback(
    (id: string, status: ThreadStatus) => statusMutation.mutate({ id, status }),
    [statusMutation]
  );

  const allThreads = (threadsQuery.data ?? []) as unknown as OutreachThread[];
  const threads = filterStatus
    ? allThreads.filter((t) => t.status === filterStatus)
    : allThreads;

  const openCount = allThreads.filter((t) => t.status === 'OPEN').length;
  const closedCount = allThreads.filter((t) => t.status === 'CLOSED').length;
  const repliedCount = allThreads.filter((t) => t.replied).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Outreach</h2>
          <p className="text-sm text-slate-500">Manage and monitor expert outreach campaigns</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3">
        <span className="material-symbols-outlined text-slate-400">filter_list</span>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projectsQuery.data?.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ThreadStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
          <span>{openCount} open</span>
          <span>{repliedCount} replied</span>
          <span>{closedCount} closed</span>
        </div>
      </Card>

      {/* Status mutation feedback */}
      {statusMutation.isError && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          Failed to update thread: {statusMutation.error instanceof Error ? statusMutation.error.message : 'Unknown error'}
        </Card>
      )}

      {/* Loading */}
      {threadsQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {threadsQuery.error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          Failed to load threads: {threadsQuery.error instanceof Error ? threadsQuery.error.message : 'Unknown error'}
        </Card>
      )}

      {/* Empty state */}
      {!threadsQuery.isLoading && threads.length === 0 && (
        <Card className="py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300">campaign</span>
          <p className="mt-2 text-sm text-slate-500">
            {selectedProjectId ? 'No outreach threads for this project' : 'No outreach threads yet'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Outreach is sent automatically when leads are enriched in a project with configured channels.</p>
        </Card>
      )}

      {/* Thread list */}
      {!threadsQuery.isLoading && threads.length > 0 && (
        <div className="space-y-3">
          {threads.map((thread) => (
            <Card key={thread.id} className="p-0 overflow-hidden">
              <div className="flex items-start gap-4 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined">{channelIcon(thread.channel)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-800 truncate">
                      {thread.expert?.fullName ?? thread.expertId}
                    </p>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${threadStatusStyle(thread.status)}`}>
                      {thread.status}
                    </span>
                    {thread.replied && (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        <span className="material-symbols-outlined text-xs">reply</span>
                        Replied
                      </span>
                    )}
                    <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">{formatRelative(thread.updatedAt)}</span>
                    <ThreadActions thread={thread} onStatusChange={handleStatusChange} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {CHANNELS.find((ch) => ch.value === thread.channel)?.label ?? thread.channel} · {thread.expert?.email ?? ''}
                  </p>

                  {thread.messages && thread.messages.length > 0 && (
                    <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 max-h-40 overflow-auto">
                      {thread.messages.map((msg, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <span className={`font-semibold shrink-0 ${msg.direction === 'OUTBOUND' ? 'text-primary' : 'text-emerald-600'}`}>
                            {msg.direction === 'OUTBOUND' ? 'Out' : 'In'}:
                          </span>
                          <span className="text-slate-600 break-words">{msg.body}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
