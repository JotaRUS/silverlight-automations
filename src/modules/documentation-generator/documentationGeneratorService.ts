import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import { clock } from '../../core/time/clock';

const GENERATED_DOCS_DIR = path.resolve(process.cwd(), 'docs/generated');

export class DocumentationGeneratorService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async generate(): Promise<void> {
    await fs.mkdir(GENERATED_DOCS_DIR, { recursive: true });

    const [projectCount, expertCount, leadCount] = await Promise.all([
      this.prismaClient.project.count(),
      this.prismaClient.expert.count(),
      this.prismaClient.lead.count()
    ]);

    const timestamp = clock.now().toISOString();
    const architectureSummary = `# Generated Architecture Summary

Generated at: ${timestamp}

- Projects: ${String(projectCount)}
- Leads: ${String(leadCount)}
- Experts: ${String(expertCount)}

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

    await Promise.all([
      fs.writeFile(path.join(GENERATED_DOCS_DIR, 'architecture-summary.md'), architectureSummary),
      fs.writeFile(path.join(GENERATED_DOCS_DIR, 'handover-summary.md'), handoverSummary)
    ]);
  }
}
