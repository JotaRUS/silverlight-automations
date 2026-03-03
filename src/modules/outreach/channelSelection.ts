import type { Channel as PrismaChannel, PrismaClient } from '@prisma/client';

import { requiresProfessionalEmailOnly } from '../../config/regionRules';
import {
  type ProjectProviderBindingField,
  type ProviderType,
  PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD
} from '../../core/providers/providerTypes';

export interface CandidateEmail {
  value: string;
  label: 'professional' | 'personal';
}

export function selectEmailsForOutreach(
  countryIso: string,
  candidateEmails: CandidateEmail[]
): CandidateEmail[] {
  if (requiresProfessionalEmailOnly(countryIso)) {
    return candidateEmails.filter((email) => email.label === 'professional');
  }
  return candidateEmails;
}

const CHANNEL_TO_PROVIDER_TYPE: Record<PrismaChannel, ProviderType> = {
  PHONE: 'YAY',
  EMAIL: 'EMAIL_PROVIDER',
  LINKEDIN: 'SALES_NAV_WEBHOOK',
  WHATSAPP: 'WHATSAPP_2CHAT',
  RESPONDIO: 'RESPONDIO',
  SMS: 'TWILIO',
  IMESSAGE: 'TWILIO',
  LINE: 'LINE',
  WECHAT: 'WECHAT',
  VIBER: 'VIBER',
  TELEGRAM: 'TELEGRAM',
  KAKAOTALK: 'KAKAOTALK',
  VOICEMAIL: 'VOICEMAIL_DROP'
};

/**
 * Checks whether a project has a provider account bound for the given channel.
 */
export async function isChannelAvailableForProject(
  prismaClient: PrismaClient,
  projectId: string,
  channel: PrismaChannel
): Promise<boolean> {
  const providerType = CHANNEL_TO_PROVIDER_TYPE[channel];
  const bindingField: ProjectProviderBindingField = PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD[providerType];
  const project = await prismaClient.project.findUnique({
    where: { id: projectId },
    select: { [bindingField]: true }
  });

  if (!project) {
    return false;
  }

  const boundAccountId = (project as Record<string, unknown>)[bindingField];
  if (typeof boundAccountId !== 'string' || !boundAccountId) {
    return false;
  }

  const account = await prismaClient.providerAccount.findFirst({
    where: { id: boundAccountId, isActive: true },
    select: { id: true }
  });

  return account !== null;
}
