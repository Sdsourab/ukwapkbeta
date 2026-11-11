/** ISO-8601 UTC timestamp. All persisted timestamps use this format (docs/05 §5.1). */
export function nowIso(): string {
  return new Date().toISOString();
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && !Number.isNaN(Date.parse(value));
}
