import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import { clock } from '../../core/time/clock';
import { openApiSpec } from '../../api/openapi/openApiSpec';
import { ENFORCEMENT } from '../../config/constants';
import { QUEUE_NAMES } from '../../queues/definitions/queueNames';
import { DEAD_LETTER_RETENTION_DAYS } from '../../queues/dlq/deadLetterPolicy';

const GENERATED_DOCS_DIR = path.resolve(process.cwd(), 'docs/generated');

export class DocumentationGeneratorService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async generate(): Promise<void> {
    await fs.mkdir(GENERATED_DOCS_DIR, { recursive: true });

    const [projectCount, expertCount, leadCount, callTaskCount, callLogCount, eventCount] = await Promise.all([
      this.prismaClient.project.count(),
      this.prismaClient.expert.count(),
      this.prismaClient.lead.count(),
      this.prismaClient.callTask.count(),
      this.prismaClient.callLog.count(),
      this.prismaClient.systemEvent.count()
    ]);

    const timestamp = clock.now().toISOString();
    const architectureSummary = `# Generated Architecture Summary

Generated at: ${timestamp}

- Projects: ${String(projectCount)}
- Leads: ${String(leadCount)}
- Experts: ${String(expertCount)}
- Call tasks: ${String(callTaskCount)}
- Call logs: ${String(callLogCount)}
- System events: ${String(eventCount)}

Core modules:
- projects
- job-title-engine
- sales-nav
- lead-ingestion
- enrichment
- cooldown
- outreach
- screening
- call-allocation
- call-validation
- performance-engine
- ranking
- google-sheets-sync
`;

    const handoverSummary = `# Generated Handover Snapshot

Timestamp: ${timestamp}

This snapshot captures current data scale and active module inventory.
Database remains source of truth.
Google Sheets remains operational mirror only.
`;

    const operationsRunbook = `# Generated Operations Runbook

Generated at: ${timestamp}

## Health and readiness checks

- Health: \`GET /api/v1/system/health\`
- Ready: \`GET /api/v1/system/ready\`
- OpenAPI: \`GET /api/v1/openapi.json\`

## Scheduler-driven maintenance

- DLQ archival cutoff: ${String(DEAD_LETTER_RETENTION_DAYS)} days
- Signup chase retry after: ${String(ENFORCEMENT.SIGNUP_CHASE_RETRY_AFTER_HOURS)} hours
- Max signup chase attempts/day: ${String(ENFORCEMENT.SIGNUP_CHASE_MAX_DAILY_CALL_ATTEMPTS)}

## Enforcement thresholds

- Cooldown: ${String(ENFORCEMENT.COOLDOWN_DAYS)} days
- Min valid call duration: ${String(ENFORCEMENT.MIN_CALL_DURATION_SECONDS)} seconds
- Target dials/hour: ${String(ENFORCEMENT.DIALS_PER_HOUR_TARGET)}
- Warmup grace minutes: ${String(ENFORCEMENT.CALLER_WARMUP_GRACE_MINUTES)}
- At-risk threshold minutes: ${String(ENFORCEMENT.CALLER_AT_RISK_THRESHOLD_MINUTES)}
- Pause threshold minutes: ${String(ENFORCEMENT.CALLER_PAUSE_THRESHOLD_MINUTES)}

## Queue inventory

${Object.values(QUEUE_NAMES)
  .map((queueName) => `- ${queueName}`)
  .join('\n')}
`;

    const stateMachineSnapshot = `# Generated State Machine Snapshot

Generated at: ${timestamp}

## Call task

\`PENDING -> ASSIGNED -> DIALING -> COMPLETED\`
\`ASSIGNED/DIALING -> CANCELLED -> PENDING (operator requeue creates new pending task)\`

## Caller allocation

\`WARMUP_GRACE -> ACTIVE -> AT_RISK -> PAUSED_LOW_DIAL_RATE\`
\`ACTIVE/AT_RISK -> RESTRICTED_FRAUD -> SUSPENDED\`
\`ACTIVE -> IDLE_NO_AVAILABLE_TASKS -> ACTIVE\`

## Screening response

\`PENDING -> IN_PROGRESS -> COMPLETE\`
\`PENDING/IN_PROGRESS -> ESCALATED\`
`;

    const envChecklist = `# Generated Environment Checklist

Generated at: ${timestamp}

## Required runtime

- DATABASE_URL
- REDIS_URL
- REDIS_NAMESPACE
- JWT_SECRET
- OPENAI_API_KEY
- APOLLO_API_KEY
- SALES_NAV_WEBHOOK_SECRET
- YAY_WEBHOOK_SECRET
- GOOGLE_SHEETS_SPREADSHEET_ID
- GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
`;

    await Promise.all([
      fs.writeFile(path.join(GENERATED_DOCS_DIR, 'architecture-summary.md'), architectureSummary),
      fs.writeFile(path.join(GENERATED_DOCS_DIR, 'handover-summary.md'), handoverSummary),
      fs.writeFile(
        path.join(GENERATED_DOCS_DIR, 'openapi.json'),
        JSON.stringify(openApiSpec, null, 2)
      ),
      fs.writeFile(path.join(GENERATED_DOCS_DIR, 'operations-runbook.md'), operationsRunbook),
      fs.writeFile(path.join(GENERATED_DOCS_DIR, 'state-machine-snapshot.md'), stateMachineSnapshot),
      fs.writeFile(path.join(GENERATED_DOCS_DIR, 'env-checklist.md'), envChecklist)
    ]);
  }
}
