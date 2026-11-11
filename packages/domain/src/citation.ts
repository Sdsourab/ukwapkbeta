import type { Author, ReferenceRecord } from './types';

/**
 * Template-based citation formatting (FR-RESM-004). These are practical templates for the
 * most common entry types, not a full CSL engine. Users should verify against the style manual.
 */

export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee';
export const CITATION_STYLES: readonly CitationStyle[] = ['apa', 'mla', 'chicago', 'harvard', 'ieee'] as const;

export interface CitationOptions {
  /** Wrap titles in `*…*` for italics (Markdown). */
  markdown?: boolean;
  /** IEEE reference number. */
  index?: number;
}

const it = (s: string, md?: boolean) => (md ? `*${s}*` : s);
const clean = (s?: string | null) => (s ?? '').trim();
const endWithPeriod = (s: string) => (/[.!?]$/.test(s) ? s : s + '.');

function initials(given?: string): string {
  return clean(given)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + '.')
    .join(' ');
}

function fullGiven(a: Author): string {
  return [clean(a.given), clean(a.family)].filter(Boolean).join(' ');
}

function authorsApa(list: Author[]): string {
  const f = list.map((a) => [clean(a.family), initials(a.given)].filter(Boolean).join(', '));
  if (f.length === 0) return '';
  if (f.length === 1) return f[0]!;
  if (f.length <= 20) return f.slice(0, -1).join(', ') + ', & ' + f[f.length - 1];
  return f.slice(0, 19).join(', ') + ', . . . ' + f[f.length - 1];
}

function authorsHarvard(list: Author[]): string {
  const f = list.map((a) => [clean(a.family), initials(a.given)].filter(Boolean).join(', '));
  if (f.length === 0) return '';
  if (f.length === 1) return f[0]!;
  if (f.length > 3) return f[0] + ' et al.';
  return f.slice(0, -1).join(', ') + ' and ' + f[f.length - 1];
}

function authorsMla(list: Author[]): string {
  if (list.length === 0) return '';
  const first = [clean(list[0]!.family), clean(list[0]!.given)].filter(Boolean).join(', ');
  if (list.length === 1) return first;
  if (list.length === 2) return `${first}, and ${fullGiven(list[1]!)}`;
  return `${first}, et al`;
}

function authorsChicago(list: Author[]): string {
  if (list.length === 0) return '';
  const names = list.map((a, i) => (i === 0 ? [clean(a.family), clean(a.given)].filter(Boolean).join(', ') : fullGiven(a)));
  if (names.length === 1) return names[0]!;
  if (names.length > 10) return names.slice(0, 7).join(', ') + ', et al';
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

function authorsIeee(list: Author[]): string {
  const f = list.map((a) => [initials(a.given), clean(a.family)].filter(Boolean).join(' '));
  if (f.length === 0) return '';
  if (f.length > 6) return f[0] + ' et al.';
  if (f.length === 1) return f[0]!;
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  return f.slice(0, -1).join(', ') + ', and ' + f[f.length - 1];
}

function doiUrl(ref: ReferenceRecord): string {
  const doi = clean(ref.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (doi) return `https://doi.org/${doi}`;
  return clean(ref.url);
}

function volIssue(ref: ReferenceRecord, style: CitationStyle): string {
  const v = clean(ref.volume);
  const i = clean(ref.issue);
  if (style === 'apa' || style === 'harvard') return v ? (i ? `${v}(${i})` : v) : '';
  if (style === 'ieee') return [v && `vol. ${v}`, i && `no. ${i}`].filter(Boolean).join(', ');
  return [v && `vol. ${v}`, i && `no. ${i}`].filter(Boolean).join(', ');
}

export function formatCitation(ref: ReferenceRecord, style: CitationStyle, opts: CitationOptions = {}): string {
  const md = opts.markdown;
  const title = clean(ref.title) || 'Untitled';
  const year = ref.year ? String(ref.year) : 'n.d.';
  const container = clean(ref.journal) || '';
  const publisher = clean(ref.publisher);
  const pages = clean(ref.pages);
  const link = doiUrl(ref);
  const isArticleLike = ref.entryType === 'article' || ref.entryType === 'conference' || ref.entryType === 'chapter';
  const hasContainer = isArticleLike && container;

  switch (style) {
    case 'apa': {
      const a = authorsApa(ref.authors);
      const head = a ? `${endWithPeriod(a)} (${year}).` : `${endWithPeriod(title)} (${year}).`;
      const body: string[] = [];
      if (hasContainer) {
        const vol = clean(ref.volume);
        const iss = clean(ref.issue);
        const journalPart =
          it(container, md) + (vol ? ', ' + it(vol, md) + (iss ? `(${iss})` : '') : '') + (pages ? ', ' + pages : '');
        if (a) body.push(endWithPeriod(title));
        body.push(endWithPeriod(journalPart));
      } else {
        if (a) body.push(endWithPeriod(it(title, md)));
        if (publisher) body.push(endWithPeriod(publisher));
      }
      if (link) body.push(link);
      return [head, ...body].join(' ').trim();
    }
    case 'harvard': {
      const a = authorsHarvard(ref.authors);
      const head = `${a || title} (${year})`;
      const parts: string[] = [];
      if (a) parts.push(endWithPeriod(hasContainer ? title : it(title, md)));
      if (hasContainer) {
        const vi = volIssue(ref, 'harvard');
        parts.push(endWithPeriod([it(container, md), vi, pages && `pp. ${pages}`].filter(Boolean).join(', ')));
      } else if (publisher) parts.push(endWithPeriod(publisher));
      if (link) parts.push(`Available at: ${link}`);
      return [head, ...parts].join(' ').replace(/\s+/g, ' ').trim();
    }
    case 'mla': {
      const a = authorsMla(ref.authors);
      const parts: string[] = [];
      if (a) parts.push(endWithPeriod(a));
      if (hasContainer) {
        parts.push(endWithPeriod(`"${title}`).replace(/\.$/, '.') + '"');
        parts.push(endWithPeriod([it(container, md), volIssue(ref, 'mla'), ref.year && String(ref.year), pages && `pp. ${pages}`].filter(Boolean).join(', ')));
      } else {
        parts.push(endWithPeriod(it(title, md)));
        parts.push(endWithPeriod([publisher, ref.year && String(ref.year)].filter(Boolean).join(', ')));
      }
      if (link) parts.push(endWithPeriod(link));
      return parts.filter(Boolean).join(' ').replace(/\."/g, '."').trim();
    }
    case 'chicago': {
      const a = authorsChicago(ref.authors);
      const parts: string[] = [];
      if (a) parts.push(endWithPeriod(a));
      if (hasContainer) {
        parts.push(`"${endWithPeriod(title)}"`);
        const vi = [clean(ref.volume), clean(ref.issue) && `no. ${clean(ref.issue)}`].filter(Boolean).join(', ');
        parts.push(endWithPeriod([it(container, md) + (vi ? ' ' + vi : ''), `(${year})`, pages].filter(Boolean).join(': ').replace(`: (${year})`, ` (${year})`)));
      } else {
        parts.push(endWithPeriod(it(title, md)));
        parts.push(endWithPeriod([publisher, ref.year && String(ref.year)].filter(Boolean).join(', ')));
      }
      if (link) parts.push(endWithPeriod(link));
      return parts.filter(Boolean).join(' ').trim();
    }
    case 'ieee': {
      const a = authorsIeee(ref.authors);
      const n = opts.index !== undefined ? `[${opts.index}] ` : '';
      const parts: string[] = [];
      if (a) parts.push(a + ',');
      if (hasContainer) {
        parts.push(`"${title},"`);
        parts.push([it(container, md), volIssue(ref, 'ieee'), pages && `pp. ${pages}`, ref.year && String(ref.year)].filter(Boolean).join(', ') + (link ? ',' : '.'));
        if (link) parts.push(clean(ref.doi) ? `doi: ${clean(ref.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}.` : `[Online]. Available: ${link}`);
      } else {
        parts.push(it(title, md) + ',');
        parts.push([publisher, ref.year && String(ref.year)].filter(Boolean).join(', ') + (link ? ',' : '.'));
        if (link) parts.push(`[Online]. Available: ${link}`);
      }
      return n + parts.join(' ').trim();
    }
  }
}

/** Formats a bibliography sorted per style conventions (IEEE keeps insertion order and numbers entries). */
export function formatBibliography(refs: ReferenceRecord[], style: CitationStyle, opts: Omit<CitationOptions, 'index'> = {}): string[] {
  if (style === 'ieee') return refs.map((r, i) => formatCitation(r, style, { ...opts, index: i + 1 }));
  const sorted = [...refs].sort((a, b) => {
    const ka = (a.authors[0]?.family ?? a.title).toLowerCase();
    const kb = (b.authors[0]?.family ?? b.title).toLowerCase();
    return ka.localeCompare(kb) || (a.year ?? 0) - (b.year ?? 0);
  });
  return sorted.map((r) => formatCitation(r, style, opts));
}
