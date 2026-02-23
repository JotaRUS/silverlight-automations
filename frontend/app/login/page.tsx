'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import type { AuthRole } from '@/types/auth';

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const { login } = useAuth();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<AuthRole>('admin');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    setLoading(true);
    setErrorMessage('');
    try {
      await login({ userId, role });
      router.push(role === 'caller' ? '/caller' : '/admin');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="userId">
            User ID
          </label>
          <Input id="userId" value={userId} onChange={(event) => setUserId(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="role">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as AuthRole)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="admin">admin</option>
            <option value="ops">ops</option>
            <option value="caller">caller</option>
          </select>
        </div>
        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        <Button onClick={() => void submit()} disabled={loading || !userId}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </Card>
    </main>
  );
}
