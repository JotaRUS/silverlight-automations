const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}$/;

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!emailRegex.test(normalized)) {
    return null;
  }
  const domain = normalized.split('@')[1];
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return null;
  }
  return normalized;
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.length < 7) {
    return null;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}
