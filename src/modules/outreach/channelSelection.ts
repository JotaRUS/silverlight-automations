import { requiresProfessionalEmailOnly } from '../../config/regionRules';

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
