import type { TextAnchor } from '@ukw/domain';
import { fingerprint } from './normalize';

export const CONTEXT_LENGTH = 48;
export const MAX_QUOTE_LENGTH = 10_000;

export interface CaptureOptions {
  contextLength?: number;
  messageId?: string;
  domPath?: string;
  selector?: string;
}

/**
 * Captures an anchor for text[start, end) (docs/07 §7.2). Leading/trailing whitespace is trimmed from
 * the quote by shrinking the range. Returns null when the range is empty or too long.
 */
export function captureAnchor(fullText: string, start: number, end: number, options: CaptureOptions = {}): TextAnchor | null {
  let s = Math.max(0, Math.min(start, fullText.length));
  let e = Math.max(0, Math.min(end, fullText.length));
  if (e < s) [s, e] = [e, s];
  while (s < e && /\s/.test(fullText[s]!)) s++;
  while (e > s && /\s/.test(fullText[e - 1]!)) e--;
  if (e <= s) return null;
  if (e - s > MAX_QUOTE_LENGTH) return null;

  const n = options.contextLength ?? CONTEXT_LENGTH;
  const exact = fullText.slice(s, e);
  const prefix = fullText.slice(Math.max(0, s - n), s);
  const suffix = fullText.slice(e, e + n);

  const anchor: TextAnchor = {
    exact,
    startOffset: s,
    endOffset: e,
    textFingerprint: fingerprint(prefix + exact + suffix),
  };
  if (prefix) anchor.prefix = prefix;
  if (suffix) anchor.suffix = suffix;
  if (options.messageId) anchor.messageId = options.messageId;
  if (options.domPath) anchor.domPath = options.domPath;
  if (options.selector) anchor.selector = options.selector;
  return anchor;
}
