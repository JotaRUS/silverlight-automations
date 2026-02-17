import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { DocumentationGeneratorService } from '../../src/modules/documentation-generator/documentationGeneratorService';

const generatedDocsDir = path.resolve(process.cwd(), 'docs/generated');

function createPrismaStub(): PrismaClient {
  return {
    project: { count: () => Promise.resolve(1) },
    expert: { count: () => Promise.resolve(2) },
    lead: { count: () => Promise.resolve(3) },
    callTask: { count: () => Promise.resolve(4) },
    callLog: { count: () => Promise.resolve(5) },
    systemEvent: { count: () => Promise.resolve(6) }
  } as unknown as PrismaClient;
}

describe('DocumentationGeneratorService', () => {
  it('writes extended generated runbook artifacts', async () => {
    const service = new DocumentationGeneratorService(createPrismaStub());
    await service.generate();

    const files = [
      'architecture-summary.md',
      'handover-summary.md',
      'openapi.json',
      'operations-runbook.md',
      'state-machine-snapshot.md',
      'env-checklist.md'
    ];

    for (const fileName of files) {
      const filePath = path.join(generatedDocsDir, fileName);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent.length).toBeGreaterThan(10);
    }
  });
});
