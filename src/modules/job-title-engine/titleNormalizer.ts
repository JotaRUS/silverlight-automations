export function normalizeJobTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deduplicateNormalizedTitles(values: string[]): string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    const normalizedValue = normalizeJobTitle(value);
    if (normalizedValue) {
      normalized.add(normalizedValue);
    }
  }
  return Array.from(normalized);
}
