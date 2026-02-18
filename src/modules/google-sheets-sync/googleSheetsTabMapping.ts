export const GOOGLE_SHEETS_TABS = {
  PROJECT_OVERVIEW: 'PROJECT_OVERVIEW',
  LEADS_PIPELINE: 'LEADS_PIPELINE',
  ENRICHMENT_LOG: 'ENRICHMENT_LOG',
  OUTREACH_STATUS: 'OUTREACH_STATUS',
  CALL_ACTIVITY: 'CALL_ACTIVITY',
  SCREENING_PROGRESS: 'SCREENING_PROGRESS',
  CALLER_PERFORMANCE: 'CALLER_PERFORMANCE',
  PHONE_EXPORT: 'PHONE_EXPORT',
  SYSTEM_ERRORS: 'SYSTEM_ERRORS'
} as const;

export type GoogleSheetTabName = (typeof GOOGLE_SHEETS_TABS)[keyof typeof GOOGLE_SHEETS_TABS];

function asString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}

function valueFromPayload(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (key in payload) {
      return asString(payload[key]);
    }
  }
  return '';
}

function valuesFromPayload(payload: Record<string, unknown>, orderedKeys: string[]): string[] {
  return orderedKeys.map((key) => valueFromPayload(payload, [key]));
}

const TAB_KEY_MAPPINGS: Record<GoogleSheetTabName, string[]> = {
  PROJECT_OVERVIEW: [
    'projectId',
    'projectName',
    'status',
    'targetThreshold',
    'signedUpCount',
    'completionPercentage',
    'priority',
    'updatedAt'
  ],
  LEADS_PIPELINE: [
    'leadId',
    'projectId',
    'fullName',
    'jobTitle',
    'companyName',
    'countryIso',
    'status',
    'updatedAt'
  ],
  ENRICHMENT_LOG: [
    'attemptId',
    'leadId',
    'provider',
    'status',
    'confidenceScore',
    'errorMessage',
    'attemptedAt'
  ],
  OUTREACH_STATUS: [
    'threadId',
    'projectId',
    'expertId',
    'channel',
    'threadStatus',
    'lastMessageAt',
    'replied'
  ],
  CALL_ACTIVITY: [
    'callId',
    'callTaskId',
    'projectId',
    'callerId',
    'expertId',
    'durationSeconds',
    'validated',
    'fraudFlag',
    'endedAt'
  ],
  SCREENING_PROGRESS: [
    'responseId',
    'projectId',
    'questionId',
    'expertId',
    'status',
    'qualified',
    'score',
    'submittedAt'
  ],
  CALLER_PERFORMANCE: [
    'metricId',
    'callerId',
    'allocationStatus',
    'rolling60MinuteDials',
    'rolling60MinuteValidConnections',
    'shortCallsLastHour',
    'snapshotAt'
  ],
  PHONE_EXPORT: [
    'expertId',
    'fullName',
    'countryIso',
    'phone',
    'phoneLabel',
    'verificationStatus',
    'projectId'
  ],
  SYSTEM_ERRORS: [
    'eventId',
    'category',
    'entityType',
    'entityId',
    'message',
    'correlationId',
    'createdAt'
  ]
};

export function mapEntityPayloadToGoogleSheetRow(
  tabName: string,
  payload: Record<string, unknown>
): string[] {
  if (Object.prototype.hasOwnProperty.call(TAB_KEY_MAPPINGS, tabName)) {
    const keyMapping = TAB_KEY_MAPPINGS[tabName as GoogleSheetTabName];
    return valuesFromPayload(payload, keyMapping);
  }
  return Object.values(payload).map((value) => asString(value));
}
