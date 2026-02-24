'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  escalateScreening,
  fetchScreeningResponses,
  triggerScreeningFollowUp
} from '@/services/adminService';

export default function ScreeningMonitorPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const queryKey = ['screening-responses', projectId];
  const responsesQuery = useQuery({
    queryKey,
    queryFn: () => fetchScreeningResponses(projectId || undefined)
  });

  const followUpMutation = useMutation({
    mutationFn: (responseId: string) => triggerScreeningFollowUp(responseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const escalateMutation = useMutation({
    mutationFn: (responseId: string) => escalateScreening(responseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-2">
        <h1 className="text-lg font-semibold">Screening Monitor</h1>
        <Input
          placeholder="Filter by project id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        />
      </Card>

      <Card>
        <div className="space-y-3">
          {responsesQuery.data?.map((screeningResponse) => (
            <div key={String(screeningResponse.id)} className="rounded border border-slate-200 p-3">
              <p className="font-medium">
                {String((screeningResponse.expert as { fullName?: string } | undefined)?.fullName ?? screeningResponse.expertId)}
              </p>
              <p className="text-xs text-slate-500">
                {String((screeningResponse.question as { prompt?: string } | undefined)?.prompt ?? '')}
              </p>
              <p className="text-xs text-slate-500">Status: {String(screeningResponse.status)}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => followUpMutation.mutate(String(screeningResponse.id))}
                >
                  Manual follow-up
                </Button>
                <Button variant="danger" onClick={() => escalateMutation.mutate(String(screeningResponse.id))}>
                  Escalate to call
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
