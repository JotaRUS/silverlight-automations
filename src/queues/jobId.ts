const JOB_ID_PART_SEPARATOR = '--';

function sanitizeJobIdPart(part: string): string {
  return part.trim().replaceAll(':', '_').replaceAll('/', '_').replaceAll(' ', '_');
}

export function buildJobId(
  prefix: string,
  ...parts: (string | number | null | undefined)[]
): string {
  const normalizedParts = [prefix, ...parts].map((part) =>
    sanitizeJobIdPart(String(part ?? 'na'))
  );
  return normalizedParts.join(JOB_ID_PART_SEPARATOR);
}
