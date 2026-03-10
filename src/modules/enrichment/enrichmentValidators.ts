const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}$/;

const DISPOSABLE_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'test.com', 'test.org', 'test.net',
  'mailinator.com', 'guerrillamail.com', 'tempmail.com',
  'throwaway.email', 'fakeinbox.com', 'sharklasers.com',
  'yopmail.com', 'trashmail.com', 'dispostable.com',
  'maildrop.cc', 'temp-mail.org', 'getnada.com',
  'placeholder.com', 'noreply.com', 'invalid.com',
  'nowhere.com', 'nomail.com', 'devnull.com',
  'sampleemail.com', 'fakemail.com', 'notreal.com',
]);

const PLACEHOLDER_LOCAL_PARTS = /^(email\d*|test\d*|user\d*|sample\d*|fake\d*|noreply|no-reply|placeholder|admin|info|hello|contact|dummy\d*)$/;

export function isFakeEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  if (PLACEHOLDER_LOCAL_PARTS.test(local)) return true;
  return false;
}

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!emailRegex.test(normalized)) {
    return null;
  }
  const domain = normalized.split('@')[1];
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return null;
  }
  if (isFakeEmail(normalized)) {
    return null;
  }
  return normalized;
}

export function isFakePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return true;
  if (/^(\d)\1{6,}$/.test(digits)) return true;
  if (/^0{7,}$/.test(digits)) return true;
  const ascending = '0123456789012345';
  const descending = '9876543210987654';
  for (let i = 0; i <= digits.length - 7; i++) {
    const chunk = digits.slice(i, i + 7);
    if (ascending.includes(chunk) || descending.includes(chunk)) return true;
  }
  const KNOWN_FAKE = ['1234567890', '1234567891', '0000000000', '1111111111', '5555555555'];
  for (const fake of KNOWN_FAKE) {
    if (digits.includes(fake)) return true;
  }
  return false;
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.length < 7) {
    return null;
  }
  if (isFakePhone(digits)) {
    return null;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}
