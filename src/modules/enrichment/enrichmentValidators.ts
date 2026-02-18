const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!emailRegex.test(normalized)) {
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
