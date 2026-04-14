'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/services/apiClient';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPS' | 'CALLER';
  timezone: string;
  languageCodes: string[];
  regionIsoCodes: string[];
  allocationStatus: string;
  createdAt: string;
  updatedAt: string;
}

type FormMode = 'idle' | 'create' | 'edit';

const ROLES = ['ADMIN', 'OPS', 'CALLER'] as const;

const roleBadgeTone: Record<string, 'success' | 'warning' | 'neutral'> = {
  ADMIN: 'success',
  OPS: 'warning',
  CALLER: 'neutral'
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export default function UsersPage(): JSX.Element {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('idle');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<string>('CALLER');
  const [formTimezone, setFormTimezone] = useState('UTC');
  const [formError, setFormError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest<User[]>('/api/v1/users');
      setUsers(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const resetForm = (): void => {
    setFormEmail('');
    setFormName('');
    setFormPassword('');
    setFormRole('CALLER');
    setFormTimezone('UTC');
    setFormError('');
    setFormMode('idle');
    setEditingUserId(null);
  };

  const openCreate = (): void => {
    resetForm();
    setFormMode('create');
  };

  const openEdit = (user: User): void => {
    setFormEmail(user.email);
    setFormName(user.name);
    setFormPassword('');
    setFormRole(user.role);
    setFormTimezone(user.timezone);
    setFormError('');
    setFormMode('edit');
    setEditingUserId(user.id);
  };

  const handleSubmit = async (): Promise<void> => {
    setSaving(true);
    setFormError('');
    try {
      if (formMode === 'create') {
        await apiRequest('/api/v1/users', {
          method: 'POST',
          body: {
            email: formEmail,
            name: formName,
            password: formPassword,
            role: formRole,
            timezone: formTimezone
          }
        });
      } else if (formMode === 'edit' && editingUserId) {
        const body: Record<string, unknown> = {};
        if (formEmail) body.email = formEmail;
        if (formName) body.name = formName;
        if (formPassword) body.password = formPassword;
        if (formRole) body.role = formRole;
        if (formTimezone) body.timezone = formTimezone;
        await apiRequest(`/api/v1/users/${editingUserId}`, {
          method: 'PATCH',
          body
        });
      }
      resetForm();
      await fetchUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string): Promise<void> => {
    try {
      await apiRequest(`/api/v1/users/${userId}`, { method: 'DELETE' });
      setDeleteConfirmId(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Users</h2>
          <p className="text-sm text-slate-500">Manage admin, ops, and caller accounts</p>
        </div>
        {formMode === 'idle' && (
          <Button onClick={openCreate}>
            <span className="material-symbols-outlined text-base">person_add</span>
            Add User
          </Button>
        )}
      </div>

      {formMode !== 'idle' && (
        <Card className="space-y-4">
          <h3 className="font-semibold">{formMode === 'create' ? 'New User' : 'Edit User'}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="user@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Password{formMode === 'edit' && <span className="text-xs font-normal text-slate-500 ml-1">(leave blank to keep current)</span>}
              </label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={formMode === 'edit' ? '••••••••' : 'Min 6 characters'}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Role</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Timezone</label>
              <Input
                value={formTimezone}
                onChange={(e) => setFormTimezone(e.target.value)}
                placeholder="e.g. America/New_York"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void handleSubmit()} disabled={saving || !formEmail || !formName || (formMode === 'create' && !formPassword)}>
              {saving ? 'Saving...' : formMode === 'create' ? 'Create User' : 'Save Changes'}
            </Button>
            <Button onClick={resetForm} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : users.length === 0 ? (
        <Card className="py-12 text-center text-slate-500">No users found</Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Timezone</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={roleBadgeTone[user.role] ?? 'neutral'}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.timezone}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        {deleteConfirmId === user.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => void handleDelete(user.id)}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(user.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
