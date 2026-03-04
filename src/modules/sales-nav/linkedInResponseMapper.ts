import type { z } from 'zod';

import type { salesNavWebhookLeadSchema } from '../../queues/definitions/jobPayloadSchemas';
import type {
  LinkedInLeadFormResponse,
  LinkedInLeadForm,
  LinkedInLeadFormQuestion
} from '../../integrations/sales-nav/linkedInLeadSyncClient';

type SalesNavWebhookLead = z.infer<typeof salesNavWebhookLeadSchema>;

export type QuestionFieldMap = Record<string, string>;

export function buildQuestionFieldMap(form: LinkedInLeadForm): QuestionFieldMap {
  const map: QuestionFieldMap = {};
  const questions: LinkedInLeadFormQuestion[] = form.content?.questions ?? [];
  for (const question of questions) {
    if (question.predefinedField) {
      map[String(question.questionId)] = question.predefinedField;
    }
  }
  return map;
}

function extractTextAnswer(
  response: LinkedInLeadFormResponse,
  questionFieldMap: QuestionFieldMap,
  ...predefinedFields: string[]
): string | undefined {
  for (const answer of response.formResponse.answers) {
    const field = questionFieldMap[String(answer.questionId)];
    if (field && predefinedFields.includes(field)) {
      const text = answer.answerDetails?.textQuestionAnswer?.answer;
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    }
  }
  return undefined;
}

function extractAllTextAnswers(
  response: LinkedInLeadFormResponse,
  questionFieldMap: QuestionFieldMap,
  ...predefinedFields: string[]
): string[] {
  const results: string[] = [];
  for (const answer of response.formResponse.answers) {
    const field = questionFieldMap[String(answer.questionId)];
    if (field && predefinedFields.includes(field)) {
      const text = answer.answerDetails?.textQuestionAnswer?.answer;
      if (text && text.trim().length > 0) {
        results.push(text.trim());
      }
    }
  }
  return results;
}

export function mapLeadFormResponseToLead(
  response: LinkedInLeadFormResponse,
  questionFieldMap: QuestionFieldMap
): SalesNavWebhookLead {
  const firstName = extractTextAnswer(response, questionFieldMap, 'FIRST_NAME');
  const lastName = extractTextAnswer(response, questionFieldMap, 'LAST_NAME');
  const companyName = extractTextAnswer(response, questionFieldMap, 'COMPANY_NAME');
  const jobTitle = extractTextAnswer(response, questionFieldMap, 'JOB_TITLE');
  const linkedinUrl = extractTextAnswer(response, questionFieldMap, 'LINKEDIN_PROFILE_LINK');
  const countryRaw = extractTextAnswer(response, questionFieldMap, 'COUNTRY');

  const emails = extractAllTextAnswers(response, questionFieldMap, 'EMAIL', 'WORK_EMAIL');
  const phones = extractAllTextAnswers(response, questionFieldMap, 'PHONE_NUMBER', 'WORK_PHONE_NUMBER');

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined;

  const countryIso = countryRaw?.length === 2 ? countryRaw.toUpperCase() : undefined;

  const unmappedAnswers: Record<string, string> = {};
  for (const answer of response.formResponse.answers) {
    const field = questionFieldMap[String(answer.questionId)];
    if (!field) {
      const text = answer.answerDetails?.textQuestionAnswer?.answer;
      if (text) {
        unmappedAnswers[answer.name ?? `q_${String(answer.questionId)}`] = text;
      }
    }
  }

  return {
    firstName,
    lastName,
    fullName,
    companyName,
    jobTitle,
    linkedinUrl,
    countryIso,
    emails,
    phones,
    metadata: {
      linkedInLeadFormResponseId: response.id,
      submittedAt: response.submittedAt,
      leadType: response.leadType,
      testLead: response.testLead,
      versionedLeadGenFormUrn: response.versionedLeadGenFormUrn,
      ...(Object.keys(unmappedAnswers).length > 0 ? { customAnswers: unmappedAnswers } : {})
    }
  };
}

const FORM_URN_ID_REGEX = /urn:li:leadGenForm:(\d+)/;

export function extractFormIdFromUrn(urn: string): string | undefined {
  const match = FORM_URN_ID_REGEX.exec(urn);
  return match?.[1];
}
