/**
 * Text normalisation helpers shared by anchor capture and restoration.
 * "Loose" form: case-folded letters and digits only. It makes matching immune to
 * whitespace, punctuation and case changes while keeping a map back to original offsets.
 */

export interface LooseText {
  text: string;
  /** map[i] = index in the original string of loose char i. */
  map: number[];
}

const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

export function looseNormalize(source: string): LooseText {
  let out = '';
  const map: number[] = [];
  let i = 0;
  while (i < source.length) {
    const cp = source.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const width = ch.length;
    if (LETTER_OR_NUMBER.test(ch)) {
      const lowered = ch.toLowerCase();
      for (let k = 0; k < lowered.length; k++) map.push(i);
      out += lowered;
    }
    i += width;
  }
  return { text: out, map };
}

export function looseString(source: string): string {
  return looseNormalize(source).text;
}

/** 32-bit FNV-1a hash of the loose form, hex encoded. Cheap, deterministic, not cryptographic. */
export function fingerprint(source: string): string {
  const s = looseString(source);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Collapses all whitespace runs to single spaces and trims. For display only. */
export function collapseWhitespace(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

/** Length of the longest common suffix of a and b. */
export function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a.charCodeAt(a.length - 1 - n) === b.charCodeAt(b.length - 1 - n)) n++;
  return n;
}

/** Length of the longest common prefix of a and b. */
export function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a.charCodeAt(n) === b.charCodeAt(n)) n++;
  return n;
}
