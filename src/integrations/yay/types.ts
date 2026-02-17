export interface YayWebhookEvent {
  event_id: string;
  event_type:
    | 'call.started'
    | 'call.ringing'
    | 'call.answered'
    | 'call.ended'
    | 'call.failed'
    | 'call.recording_ready';
  event_version: string;
  timestamp: string;
  account_id: string;
  data: {
    call_id: string;
    direction: 'outbound' | 'inbound';
    status: string;
    from: {
      number: string;
      extension?: string;
    };
    to: {
      number: string;
      country?: string;
    };
    call_metadata?: {
      project_id: string;
      expert_id: string;
      call_task_id: string;
      caller_id: string;
    };
    timing: {
      initiated_at?: string;
      answered_at?: string;
      ended_at?: string;
      duration_seconds: number;
      billable_seconds?: number;
      ring_duration_seconds?: number;
    };
    termination: {
      reason: string;
      sip_code?: number;
    };
    recording?: {
      available: boolean;
      recording_id?: string;
      recording_url?: string;
    };
  };
}
