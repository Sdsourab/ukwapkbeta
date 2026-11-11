import type { AnchorStrategy, TextAnchor } from '@ukw/domain';
import { captureAnchor } from './capture';
import { commonPrefixLength, commonSuffixLength, fingerprint, looseNormalize, looseString, type LooseText } from './normalize';

/**
 * Anchor restoration (docs/07 §7.3, §7.4).
 *
 * THRESHOLDS ARE NOT CALIBRATED against real pages (docs/07 §7.4 says they must not be treated as
 * universal truth). They are deliberately conservative: a wrong restoration is worse than an
 * unresolved one (docs/11 §11.3).
 */
export const THRESHOLDS = {
  /** Minimum score for a unique exact match to be accepted automatically. */
  uniqueExact: 0.7,
  /** A unique exact match of a quote at least this long is accepted even if context changed. */
  longQuoteChars: 40,
  /** Minimum score for the best of several candidates. */
  bestOfMany: 0.75,
  /** Required lead of the best candidate over the runner-up. */
  margin: 0.2,
  /** Loose (whitespace/punctuation/case-insensitive) matching needs at least this many loose chars. */
  looseMinChars: 12,
  /** Loose match needs at least this much context agreement (0..1) unless the quote is long. */
  looseContext: 0.5,
  maxCandidates: 100,
} as const;

/**
 * Restoring N annotations against one page asks for the page's loose form N times. Normalising a large page is
 * O(length), so it is memoised for the most recent text (same string reference ⇒ constant-time hit).
 * Measured before the cache: 300 loose matches on a 1.1 MB page took 40 s; with it they take a fraction of that.
 */
let lastLooseText: string | null = null;
let lastLoose: LooseText | null = null;
function looseOfPage(text: string): LooseText {
  if (lastLoose && lastLooseText === text) return lastLoose;
  lastLoose = looseNormalize(text);
  lastLooseText = text;
  return lastLoose;
}

/** Drops the memoised page text (call when a page is discarded to release memory). */
export function clearRestoreCache(): void {
  lastLooseText = null;
  lastLoose = null;
}

export interface AnchorMatch {
  start: number;
  end: number;
  /** 0..1 confidence. */
  score: number;
  strategy: AnchorStrategy;
}

export type RestoreResult =
  | { status: 'matched'; match: AnchorMatch; candidates: AnchorMatch[] }
  | { status: 'ambiguous'; candidates: AnchorMatch[] }
  | { status: 'orphaned'; candidates: [] };

/** 0..1 agreement between the stored prefix and the text before `start`; null when unknown. */
function prefixAgreement(text: string, start: number, stored?: string): number | null {
  if (!stored) return null;
  const storedLoose = looseString(stored);
  if (!storedLoose) return null;
  const before = looseString(text.slice(Math.max(0, start - stored.length - 16), start));
  return Math.min(1, commonSuffixLength(storedLoose, before) / storedLoose.length);
}

function suffixAgreement(text: string, end: number, stored?: string): number | null {
  if (!stored) return null;
  const storedLoose = looseString(stored);
  if (!storedLoose) return null;
  const after = looseString(text.slice(end, end + stored.length + 16));
  return Math.min(1, commonPrefixLength(storedLoose, after) / storedLoose.length);
}

function contextAgreement(text: string, start: number, end: number, anchor: TextAnchor): number {
  const parts = [prefixAgreement(text, start, anchor.prefix), suffixAgreement(text, end, anchor.suffix)].filter(
    (v): v is number => v !== null,
  );
  if (parts.length === 0) return 0.5; // neutral: nothing to compare
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function contextFingerprintAt(text: string, start: number, end: number, anchor: TextAnchor): string {
  return fingerprint(text.slice(Math.max(0, start - (anchor.prefix?.length ?? 0)), end + (anchor.suffix?.length ?? 0)));
}

function findAll(haystack: string, needle: string, limit: number): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let from = 0;
  while (out.length < limit) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    out.push(idx);
    from = idx + 1;
  }
  return out;
}

function exactCandidates(text: string, anchor: TextAnchor): AnchorMatch[] {
  return findAll(text, anchor.exact, THRESHOLDS.maxCandidates).map((start) => {
    const end = start + anchor.exact.length;
    const ctx = contextAgreement(text, start, end, anchor);
    let score = 0.5 + 0.5 * ctx;
    if (anchor.startOffset === start) score = Math.min(1, score + 0.05); // tie-breaker only
    return { start, end, score, strategy: 'exact-context' as const };
  });
}

function looseCandidates(text: string, anchor: TextAnchor): AnchorMatch[] {
  const quote = looseString(anchor.exact);
  if (quote.length < THRESHOLDS.looseMinChars) return [];
  const loose = looseOfPage(text);
  const hits = findAll(loose.text, quote, THRESHOLDS.maxCandidates);
  const out: AnchorMatch[] = [];
  for (const h of hits) {
    const start = loose.map[h]!;
    const end = loose.map[h + quote.length - 1]! + 1;
    const ctx = contextAgreement(text, start, end, anchor);
    // Loose matches are capped below exact matches so exact always wins.
    out.push({ start, end, score: Math.min(0.9, 0.4 + 0.5 * ctx), strategy: 'loose-context' });
  }
  return out;
}

export function restoreAnchor(text: string, anchor: TextAnchor): RestoreResult {
  if (!anchor.exact) return { status: 'orphaned', candidates: [] };

  // 1. Offset fast path: only trusted when the stored fingerprint still matches the surrounding text.
  const { startOffset: so, endOffset: eo } = anchor;
  if (
    so !== undefined && eo !== undefined && anchor.textFingerprint &&
    eo <= text.length && so < eo && text.slice(so, eo) === anchor.exact &&
    contextFingerprintAt(text, so, eo, anchor) === anchor.textFingerprint
  ) {
    const match: AnchorMatch = { start: so, end: eo, score: 1, strategy: 'offset' };
    return { status: 'matched', match, candidates: [match] };
  }

  // 2. Exact quote candidates scored by context.
  let candidates = exactCandidates(text, anchor);
  let usedLoose = false;

  // 3. Loose fallback only when no exact candidate exists.
  if (candidates.length === 0) {
    candidates = looseCandidates(text, anchor);
    usedLoose = true;
  }
  if (candidates.length === 0) return { status: 'orphaned', candidates: [] };

  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const top = candidates[0]!;
  const second = candidates[1];
  const quoteLength = looseString(anchor.exact).length;

  if (candidates.length === 1) {
    if (usedLoose) {
      const ctx = contextAgreement(text, top.start, top.end, anchor);
      const trusted = ctx >= THRESHOLDS.looseContext || quoteLength >= THRESHOLDS.longQuoteChars;
      return trusted ? { status: 'matched', match: top, candidates } : { status: 'ambiguous', candidates };
    }
    const trusted = top.score >= THRESHOLDS.uniqueExact || anchor.exact.length >= THRESHOLDS.longQuoteChars;
    if (!trusted) return { status: 'ambiguous', candidates };
    return { status: 'matched', match: { ...top, strategy: top.score >= THRESHOLDS.uniqueExact ? 'exact-context' : 'exact-unique' }, candidates };
  }

  const lead = top.score - (second?.score ?? 0);
  if (top.score >= THRESHOLDS.bestOfMany && lead >= THRESHOLDS.margin) {
    return { status: 'matched', match: top, candidates: candidates.slice(0, 10) };
  }
  return { status: 'ambiguous', candidates: candidates.slice(0, 10) };
}

/** Builds an updated anchor after a user-confirmed (re)attachment to a candidate. */
export function reattachAnchor(text: string, previous: TextAnchor, match: Pick<AnchorMatch, 'start' | 'end'>): TextAnchor | null {
  const next = captureAnchor(text, match.start, match.end, { messageId: previous.messageId });
  if (!next) return null;
  return { ...next, confidence: 1, strategy: 'manual' };
}
