export function subDays(date: Date, days: number): Date {
  const clone = new Date(date.toISOString());
  clone.setUTCDate(clone.getUTCDate() - days);
  return clone;
}
