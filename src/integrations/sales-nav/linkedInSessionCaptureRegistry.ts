export type LinkedInSessionCaptureState = 'idle' | 'running' | 'succeeded' | 'failed';

export interface LinkedInSessionCaptureStatus {
  state: LinkedInSessionCaptureState;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

const captureStatuses = new Map<string, LinkedInSessionCaptureStatus>();

function baseStatus(): LinkedInSessionCaptureStatus {
  return {
    state: 'idle',
    startedAt: null,
    finishedAt: null,
    error: null
  };
}

export function getLinkedInSessionCaptureStatus(
  providerAccountId: string
): LinkedInSessionCaptureStatus {
  return captureStatuses.get(providerAccountId) ?? baseStatus();
}

export function runLinkedInSessionCapture(
  providerAccountId: string,
  task: () => Promise<void>
): { started: boolean; status: LinkedInSessionCaptureStatus } {
  const existing = getLinkedInSessionCaptureStatus(providerAccountId);
  if (existing.state === 'running') {
    return { started: false, status: existing };
  }

  const startedAt = new Date().toISOString();
  const runningStatus: LinkedInSessionCaptureStatus = {
    state: 'running',
    startedAt,
    finishedAt: null,
    error: null
  };
  captureStatuses.set(providerAccountId, runningStatus);

  void task()
    .then(() => {
      captureStatuses.set(providerAccountId, {
        state: 'succeeded',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: null
      });
    })
    .catch((error: unknown) => {
      captureStatuses.set(providerAccountId, {
        state: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Session capture failed'
      });
    });

  return { started: true, status: runningStatus };
}
