/**
 * URL identity (docs/07 §7.5).
 * Only parameters on the explicit TRACKING allowlist are removed. Every other query
 * parameter is kept because it may identify a conversation or document.
 */

const TRACKING_PARAM_EXACT = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'ref_src',
  'ref_url',
  'spm',
  'si',
]);
const TRACKING_PARAM_PREFIX = ['utm_', 'hsa_', 'pk_', 'mtm_'];

export function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return TRACKING_PARAM_EXACT.has(n) || TRACKING_PARAM_PREFIX.some((p) => n.startsWith(p));
}

export interface NormalizedUrl {
  original: string;
  normalized: string;
  hostname: string;
  path: string;
  protocol: string;
}

export const SUPPORTED_PROTOCOLS = ['http:', 'https:', 'file:'] as const;

/** Returns null when the URL cannot be parsed or uses an unsupported scheme (e.g. `javascript:`). */
export function normalizeUrl(input: string): NormalizedUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!(SUPPORTED_PROTOCOLS as readonly string[]).includes(url.protocol)) return null;

  const hostname = url.hostname.toLowerCase();
  const isDefaultPort = (url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443');
  const port = url.port && !isDefaultPort ? `:${url.port}` : '';

  let path = url.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '') path = '/';

  const kept: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    if (!isTrackingParam(key)) kept.push([key, value]);
  });
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const query = kept.length
    ? '?' + kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  // Fragments are dropped unless they look like client-side routes (`#/…`, `#!/…`).
  const hash = /^#!?\//.test(url.hash) ? url.hash : '';

  const normalized =
    url.protocol === 'file:' ? `file://${path}` : `${url.protocol}//${hostname}${port}${path}${query}${hash}`;

  return { original: input, normalized, hostname, path, protocol: url.protocol };
}

/** Allows only http(s) links to be opened from user-controlled data (docs/12 §12.4). */
export function isSafeLink(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
