export interface ExpertContact {
  id: string;
  type: 'EMAIL' | 'PHONE' | 'LINKEDIN' | 'HANDLE';
  label: string;
  value: string;
  valueNormalized: string;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'BOUNCED' | 'INVALID';
  isPrimary: boolean;
  confidenceScore: string | null;
}

export interface CallLogTaskSummary {
  callOutcome: string | null;
  status: string;
}

export interface CallLogRecord {
  id: string;
  callTaskId: string | null;
  projectId: string | null;
  expertId: string | null;
  callerId: string | null;
  callId: string;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  billableSeconds: number | null;
  ringDurationSeconds: number | null;
  dialedNumber: string;
  terminationReason: string | null;
  sipCode: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  callTask: CallLogTaskSummary | null;
}

export interface OutreachMessageRecord {
  id: string;
  direction: 'OUTBOUND' | 'INBOUND';
  status: string;
  body: string;
  sentAt: string | null;
  receivedAt: string | null;
}

export interface OutreachThreadRecord {
  id: string;
  channel: string;
  status: string;
  firstContactAt: string | null;
  lastMessageAt: string | null;
  replied: boolean;
  messages: OutreachMessageRecord[];
}

export interface ExpertRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  currentRole: string | null;
  currentCompany: string | null;
  countryIso: string | null;
  timezone: string | null;
  languageCodes: string[];
  status: string;
  contacts: ExpertContact[];
  callLogs: CallLogRecord[];
  outreachThreads: OutreachThreadRecord[];
}

export interface ProjectSummary {
  name: string;
  geographyIsoCodes: string[];
}

export interface EnrichedCallTask {
  id: string;
  projectId: string;
  expertId: string;
  callerId: string | null;
  status: string;
  callOutcome: string | null;
  priorityScore: number | string;
  assignedAt: string | null;
  executionWindowStartsAt: string | null;
  executionWindowEndsAt: string | null;
  attemptedDialCount: number;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  expert: ExpertRecord;
  project: ProjectSummary;
}

export interface CallerPerformanceRecord {
  rolling60MinuteDials: number;
  allocationStatus: string;
}
