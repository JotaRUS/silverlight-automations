import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';

const openAiResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string()
      })
    })
  )
});

const rawTitleExpansionResultSchema = z.object({
  titles: z.array(
    z.object({
      title: z.string().min(1),
      relevanceScore: z.union([z.number(), z.string()]),
      relevant: z.union([z.boolean(), z.string()]).optional(),
      reason: z.string().optional()
    })
  )
});

export interface OpenAiCredentials {
  apiKey: string;
  model: string;
  classificationTemperature: number;
}

export interface JobTitleExpansionInput {
  projectName: string;
  companyName: string;
  geographyIsoCode: string;
  sourceTitles: string[];
  correlationId: string;
}

export interface ExpandedTitle {
  title: string;
  relevanceScore: number;
  relevant: boolean;
  reason: string;
}

function normalizeScore(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value > 1 && value <= 100) {
      return Math.max(0, Math.min(1, value / 100));
    }
    return Math.max(0, Math.min(1, value));
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const numericPortion = Number.parseFloat(trimmed.replace('%', ''));
  if (!Number.isFinite(numericPortion)) {
    return 0;
  }

  if (trimmed.includes('%') || numericPortion > 1) {
    return Math.max(0, Math.min(1, numericPortion / 100));
  }

  return Math.max(0, Math.min(1, numericPortion));
}

function normalizeRelevant(value: boolean | string | undefined, relevanceScore: number): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === 'no') {
      return false;
    }
  }
  return relevanceScore >= 0.4;
}

export class OpenAiClient {
  public async expandAndScoreTitles(
    input: JobTitleExpansionInput,
    credentials: OpenAiCredentials
  ): Promise<ExpandedTitle[]> {
    if (!credentials.apiKey) {
      throw new AppError('OpenAI API key is missing', 500, 'openai_api_key_missing');
    }

    const prompt = [
      'You are a deterministic job-title discovery engine for expert sourcing.',
      'Your primary task is to infer realistic job titles for people working at the target company based on the project name and sourcing intent.',
      'Use Apollo titles only as supporting evidence, not as a requirement.',
      'If Apollo titles are empty, you must still return a useful list of likely real-world job titles.',
      'Prefer concrete titles used on LinkedIn and company org charts over generic labels.',
      'Return 8-15 titles when possible, including common variants and seniority variations that improve Sales Navigator search coverage.',
      'Mark titles as relevant=true when they plausibly fit the project intent and company context.',
      `Project name / target intent: ${input.projectName}`,
      `Company: ${input.companyName}`,
      `Geography ISO: ${input.geographyIsoCode}`,
      `Apollo supporting titles: ${JSON.stringify(input.sourceTitles)}`,
      'Return a strict JSON object with key "titles".',
      'Each title item must include: title, relevanceScore, relevant, reason.',
      'relevanceScore must be a decimal number between 0 and 1, not a percentage.'
    ].join('\n');

    const response = await requestJson<unknown>({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        authorization: `Bearer ${credentials.apiKey}`
      },
      body: {
        model: credentials.model || 'gpt-4o-mini',
        temperature: credentials.classificationTemperature ?? 0.2,
        response_format: {
          type: 'json_object'
        },
        messages: [
          {
            role: 'system',
            content: 'Return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      provider: 'openai',
      operation: 'title-expand-score',
      correlationId: input.correlationId
    });

    const parsed = openAiResponseSchema.parse(response);
    const rawContent = parsed.choices[0]?.message.content;
    if (!rawContent) {
      throw new AppError('OpenAI returned empty content', 502, 'openai_empty_response');
    }

    const structured = rawTitleExpansionResultSchema.parse(JSON.parse(rawContent));
    const deduplicatedTitles = new Map<string, ExpandedTitle>();
    for (const title of structured.titles) {
      const normalizedTitle = title.title.trim();
      const key = normalizedTitle.toLowerCase();
      if (!key) {
        continue;
      }
      const relevanceScore = normalizeScore(title.relevanceScore);
      const relevant = normalizeRelevant(title.relevant, relevanceScore);
      if (!deduplicatedTitles.has(key)) {
        deduplicatedTitles.set(key, {
          title: normalizedTitle,
          relevanceScore,
          relevant,
          reason: title.reason?.trim() || 'Inferred from project intent and company context.'
        });
      }
    }

    return Array.from(deduplicatedTitles.values());
  }
}
