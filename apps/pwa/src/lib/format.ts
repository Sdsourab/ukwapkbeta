const RTF = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

/** "3 hours ago" style label for an ISO timestamp. */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = Date.parse(iso) - now;
  if (Number.isNaN(diff)) return '';
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 3.15e10], ['month', 2.63e9], ['week', 6.048e8], ['day', 8.64e7], ['hour', 3.6e6], ['minute', 6e4]];
  for (const [unit, ms] of units) {
    if (abs >= ms) return RTF ? RTF.format(Math.round(diff / ms), unit) : `${Math.round(abs / ms)} ${unit}s ago`;
  }
  return 'just now';
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n - 1) + '…' : flat;
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
