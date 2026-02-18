import { z } from 'zod';

import { env } from '../../config/env';
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

const titleExpansionResultSchema = z.object({
  titles: z.array(
    z.object({
      title: z.string().min(1),
      relevanceScore: z.number().min(0).max(1),
      relevant: z.boolean(),
      reason: z.string().min(1)
    })
  )
});

export interface JobTitleExpansionInput {
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

export class OpenAiClient {
  public async expandAndScoreTitles(input: JobTitleExpansionInput): Promise<ExpandedTitle[]> {
    if (!env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is missing', 500, 'openai_api_key_missing');
    }

    const prompt = [
      'You are a deterministic job-title classification engine.',
      'Expand the title list using real world variants, remove irrelevant titles, and score relevance 0-1.',
      `Company: ${input.companyName}`,
      `Geography ISO: ${input.geographyIsoCode}`,
      `Input titles: ${JSON.stringify(input.sourceTitles)}`,
      'Return strict JSON object with key "titles".'
    ].join('\n');

    const response = await requestJson<unknown>({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: {
        model: env.OPENAI_MODEL,
        temperature: env.OPENAI_CLASSIFICATION_TEMPERATURE,
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

    const structured = titleExpansionResultSchema.parse(JSON.parse(rawContent));
    return structured.titles;
  }
}
