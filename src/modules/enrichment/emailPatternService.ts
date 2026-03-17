import type { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface EmailSample {
  email: string;
  firstName: string;
  lastName: string;
}

interface DetectedPattern {
  pattern: string;
  confidence: number;
  matchCount: number;
}

interface StoredPattern {
  domain: string;
  pattern: string;
  confidence: number;
  sampleCount: number;
}

const KNOWN_PATTERNS: { name: string; generate: (first: string, last: string) => string }[] = [
  { name: '{first}.{last}', generate: (f, l) => `${f}.${l}` },
  { name: '{first}{last}', generate: (f, l) => `${f}${l}` },
  { name: '{f}{last}', generate: (f, l) => `${f[0]}${l}` },
  { name: '{first}_{last}', generate: (f, l) => `${f}_${l}` },
  { name: '{first}-{last}', generate: (f, l) => `${f}-${l}` },
  { name: '{last}.{first}', generate: (f, l) => `${l}.${f}` },
  { name: '{last}{first}', generate: (f, l) => `${l}${f}` },
  { name: '{f}.{last}', generate: (f, l) => `${f[0]}.${l}` },
  { name: '{first}', generate: (f) => f },
  { name: '{last}', generate: (_, l) => l },
  { name: '{f}{l}', generate: (f, l) => `${f[0]}${l[0]}` }
];

const MIN_SAMPLES_FOR_CONFIDENCE = 2;
const HIGH_CONFIDENCE_THRESHOLD = 0.80;

export class EmailPatternService {
  constructor(private readonly prisma: PrismaClient) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public detectPattern(samples: EmailSample[], _domain: string): DetectedPattern | null {
    if (samples.length === 0) return null;

    const patternScores = new Map<string, number>();

    for (const sample of samples) {
      const localPart = sample.email.split('@')[0]?.toLowerCase();
      if (!localPart) continue;

      const first = sample.firstName.toLowerCase().replace(/[^a-z]/g, '');
      const last = sample.lastName.toLowerCase().replace(/[^a-z]/g, '');
      if (!first || !last) continue;

      for (const pattern of KNOWN_PATTERNS) {
        const generated = pattern.generate(first, last);
        if (generated === localPart) {
          patternScores.set(pattern.name, (patternScores.get(pattern.name) ?? 0) + 1);
        }
      }
    }

    if (patternScores.size === 0) return null;

    let bestPattern = '';
    let bestCount = 0;
    for (const [pattern, count] of patternScores) {
      if (count > bestCount) {
        bestPattern = pattern;
        bestCount = count;
      }
    }

    return {
      pattern: bestPattern,
      confidence: bestCount / samples.length,
      matchCount: bestCount
    };
  }

  public generateEmail(firstName: string, lastName: string, domain: string, pattern: string): string | null {
    const first = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const last = lastName.toLowerCase().replace(/[^a-z]/g, '');
    if (!first || !last) return null;

    const patternDef = KNOWN_PATTERNS.find((p) => p.name === pattern);
    if (!patternDef) return null;

    const localPart = patternDef.generate(first, last);
    return `${localPart}@${domain}`;
  }

  public async getOrDetectPattern(domain: string): Promise<StoredPattern | null> {
    const existing = await this.prisma.companyEmailPattern.findUnique({
      where: { domain }
    });

    if (
      existing &&
      existing.sampleCount >= MIN_SAMPLES_FOR_CONFIDENCE &&
      Number(existing.confidence) >= HIGH_CONFIDENCE_THRESHOLD
    ) {
      return {
        domain: existing.domain,
        pattern: existing.pattern,
        confidence: Number(existing.confidence),
        sampleCount: existing.sampleCount
      };
    }

    return null;
  }

  public async needsMoreSamples(domain: string): Promise<boolean> {
    const existing = await this.prisma.companyEmailPattern.findUnique({
      where: { domain }
    });

    if (!existing) return true;
    if (existing.sampleCount < MIN_SAMPLES_FOR_CONFIDENCE) return true;
    if (Number(existing.confidence) < HIGH_CONFIDENCE_THRESHOLD) return true;
    return false;
  }

  public async persistPattern(
    domain: string,
    samples: EmailSample[]
  ): Promise<StoredPattern | null> {
    const detected = this.detectPattern(samples, domain);
    if (!detected) return null;

    const result = await this.prisma.companyEmailPattern.upsert({
      where: { domain },
      create: {
        domain,
        pattern: detected.pattern,
        confidence: new Decimal(detected.confidence.toFixed(2)),
        sampleCount: samples.length,
        sampleEmails: samples.map((s) => ({
          email: s.email,
          firstName: s.firstName,
          lastName: s.lastName
        }))
      },
      update: {
        pattern: detected.pattern,
        confidence: new Decimal(detected.confidence.toFixed(2)),
        sampleCount: samples.length,
        sampleEmails: samples.map((s) => ({
          email: s.email,
          firstName: s.firstName,
          lastName: s.lastName
        }))
      }
    });

    return {
      domain: result.domain,
      pattern: result.pattern,
      confidence: Number(result.confidence),
      sampleCount: result.sampleCount
    };
  }
}
