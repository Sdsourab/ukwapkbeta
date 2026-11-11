import { describe, expect, it } from 'vitest';
import { captureAnchor, fingerprint, looseNormalize, reattachAnchor, restoreAnchor } from './index';

const ARTICLE = [
  'Reading research shows that attention drifts during long passages.',
  'Participants who highlighted key sentences recalled more details after one week.',
  'However, highlighting every line removed the benefit entirely.',
  'The authors recommend selective marking combined with brief notes.',
].join('\n');

function anchorFor(text: string, quote: string, nth = 0) {
  let idx = -1;
  for (let i = 0; i <= nth; i++) idx = text.indexOf(quote, idx + 1);
  expect(idx).toBeGreaterThanOrEqual(0);
  const a = captureAnchor(text, idx, idx + quote.length);
  expect(a).not.toBeNull();
  return a!;
}

describe('captureAnchor', () => {
  it('stores quote, context, offsets and fingerprint; trims whitespace', () => {
    const a = captureAnchor(ARTICLE, 0, 20)!;
    expect(a.exact).toBe('Reading research sho');
    expect(a.startOffset).toBe(0);
    expect(a.prefix).toBeUndefined();
    expect(a.suffix?.length).toBeGreaterThan(0);
    expect(a.textFingerprint).toMatch(/^[0-9a-f]{8}$/);
    const padded = captureAnchor('  hello world  ', 0, 15)!;
    expect(padded.exact).toBe('hello world');
  });
  it('rejects empty and oversized selections', () => {
    expect(captureAnchor('abc', 1, 1)).toBeNull();
    expect(captureAnchor('   ', 0, 3)).toBeNull();
    expect(captureAnchor('x'.repeat(10_001), 0, 10_001)).toBeNull();
  });
});

describe('looseNormalize / fingerprint', () => {
  it('keeps only case-folded letters and digits and maps back', () => {
    const l = looseNormalize('Hi, Wörld! 42');
    expect(l.text).toBe('hiwörld42');
    expect(l.map[0]).toBe(0);
    expect(l.map[2]).toBe(4);
  });
  it('fingerprint ignores whitespace and punctuation', () => {
    expect(fingerprint('Hello,  world!')).toBe(fingerprint('hello world'));
    expect(fingerprint('hello world')).not.toBe(fingerprint('hello there'));
  });
});

describe('restoreAnchor fixtures (docs/11 §11.3)', () => {
  const quote = 'Participants who highlighted key sentences recalled more details after one week.';

  it('unchanged article → offset strategy, full confidence', () => {
    const r = restoreAnchor(ARTICLE, anchorFor(ARTICLE, quote));
    expect(r.status).toBe('matched');
    if (r.status === 'matched') {
      expect(r.match.strategy).toBe('offset');
      expect(r.match.score).toBe(1);
      expect(ARTICLE.slice(r.match.start, r.match.end)).toBe(quote);
    }
  });

  it('extra paragraph inserted above → still restored by context', () => {
    const anchor = anchorFor(ARTICLE, quote);
    const changed = 'A new introductory paragraph was added to the page.\n' + ARTICLE;
    const r = restoreAnchor(changed, anchor);
    expect(r.status).toBe('matched');
    if (r.status === 'matched') {
      expect(changed.slice(r.match.start, r.match.end)).toBe(quote);
      expect(r.match.strategy).not.toBe('offset');
    }
  });

  it('whitespace changes inside the quote → loose match with correct range', () => {
    const anchor = anchorFor(ARTICLE, quote);
    const changed = ARTICLE.replace('highlighted key sentences', 'highlighted   key\n sentences');
    const r = restoreAnchor(changed, anchor);
    expect(r.status).toBe('matched');
    if (r.status === 'matched') {
      expect(r.match.strategy).toBe('loose-context');
      expect(changed.slice(r.match.start, r.match.end)).toContain('highlighted   key\n sentences');
    }
  });

  it('punctuation and case changes → loose match', () => {
    const anchor = anchorFor(ARTICLE, 'selective marking combined with brief notes');
    const changed = ARTICLE.replace('selective marking combined with brief notes.', 'Selective-marking, combined with brief notes!');
    const r = restoreAnchor(changed, anchor);
    expect(r.status).toBe('matched');
  });

  it('duplicate quote with different context → picks the right occurrence', () => {
    const text = 'Introduction. The key finding is clear. Methods section follows.\nResults. The key finding is clear. Discussion section follows.';
    const second = anchorFor(text, 'The key finding is clear.', 1);
    const r = restoreAnchor(text.replace('Introduction.', 'Preface to the study.'), second);
    expect(r.status).toBe('matched');
    if (r.status === 'matched') {
      const t = text.replace('Introduction.', 'Preface to the study.');
      expect(t.slice(r.match.start - 9, r.match.start)).toContain('Results.');
    }
  });

  it('duplicate quote with identical context → ambiguous, never guessed', () => {
    // Both occurrences have the same neighbours as far as the stored context can tell.
    const original = 'Intro. Same words here. Outro.\nIntro. Same words here. Outro.';
    // A short context window (7 chars) is identical for both blocks, so nothing can tell them apart.
    const anchor = captureAnchor(original, original.indexOf('Same'), original.indexOf('Same') + 'Same words here.'.length, { contextLength: 7 })!;
    // Page changed so offsets/fingerprint no longer shortcut the match.
    const changed = 'Banner. ' + original;
    const r = restoreAnchor(changed, anchor);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toHaveLength(2);
  });

  it('duplicate quote whose stored context matches neither occurrence → ambiguous', () => {
    const flat = 'x Same words here. y Same words here. z';
    const r = restoreAnchor(flat, { exact: 'Same words here.', prefix: 'unrelated prefix', suffix: 'unrelated suffix' });
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toHaveLength(2);
  });

  it('deleted quote → orphaned', () => {
    const anchor = anchorFor(ARTICLE, quote);
    const changed = ARTICLE.replace(quote + '\n', '');
    const r = restoreAnchor(changed, anchor);
    expect(r.status).toBe('orphaned');
  });

  it('meaningfully edited quote → orphaned instead of attaching to a similar paragraph (TC-ANN-07)', () => {
    const anchor = anchorFor(ARTICLE, quote);
    const changed = ARTICLE.replace('recalled more details', 'forgot most details');
    const r = restoreAnchor(changed, anchor);
    expect(r.status).toBe('orphaned');
  });

  it('reordered content → unique long quote still restores to the correct text', () => {
    const anchor = anchorFor(ARTICLE, quote);
    const lines = ARTICLE.split('\n');
    const reordered = [lines[3], lines[2], lines[1], lines[0]].join('\n');
    const r = restoreAnchor(reordered, anchor);
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(reordered.slice(r.match.start, r.match.end)).toBe(quote);
  });

  it('short unique quote whose context vanished → ambiguous (asks the user)', () => {
    const text = 'Alpha beta gamma delta epsilon zeta eta theta.';
    const anchor = anchorFor(text, 'gamma');
    const changed = 'Completely different surrounding words with gamma inside somewhere else.';
    const r = restoreAnchor(changed, anchor);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toHaveLength(1);
  });

  it('dynamic content loaded later → orphaned first, matched after content appears', () => {
    const anchor = anchorFor(ARTICLE, quote);
    const initial = ARTICLE.split('\n').filter((l) => l !== quote).join('\n');
    expect(restoreAnchor(initial, anchor).status).toBe('orphaned');
    expect(restoreAnchor(ARTICLE, anchor).status).toBe('matched');
  });

  it('empty or missing quote is orphaned', () => {
    expect(restoreAnchor(ARTICLE, { exact: '' }).status).toBe('orphaned');
  });
});

describe('reattachAnchor', () => {
  it('creates a fresh manual anchor for a user-chosen candidate', () => {
    const text = 'x Same words here. y Same words here. z';
    const prev = { exact: 'Same words here.', prefix: 'nope', suffix: 'nope', messageId: 'm-1' };
    const r = restoreAnchor(text, prev);
    expect(r.status).toBe('ambiguous');
    const chosen = r.candidates[1]!;
    const next = reattachAnchor(text, prev, chosen)!;
    expect(next.strategy).toBe('manual');
    expect(next.startOffset).toBe(chosen.start);
    expect(next.messageId).toBe('m-1');
    expect(restoreAnchor(text, next).status).toBe('matched');
  });
});

describe('performance', () => {
  it('restores 300 highlights that need loose matching on a 1 MB changed page in a few seconds, not minutes', () => {
    const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    let text = '';
    for (let i = 0; i < 17_000; i++) text += para + 'item ' + i + '. ';
    const anchors = Array.from({ length: 300 }, (_, i) => {
      const q = `consectetur adipiscing elit. item ${i * 50}`;
      const at = text.indexOf(q);
      return captureAnchor(text, at, at + q.length)!;
    });
    const changed = text.replace(/\. /g, '.  ').replace(/,/g, ';'); // exact misses, loose hits
    const t0 = performance.now();
    const matched = anchors.filter((a) => restoreAnchor(changed, a).status === 'matched').length;
    const ms = performance.now() - t0;
    expect(matched).toBe(300);
    expect(ms).toBeLessThan(8000); // was ~40 000 ms before memoising the page's loose form
  }, 60_000);

  it('restores in a 1 MB document quickly', () => {
    const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    let text = '';
    for (let i = 0; i < 18_000; i++) text += para + i + ' ';
    const q = 'consectetur adipiscing elit. 9000 Lorem ipsum';
    const idx = text.indexOf(q);
    const anchor = captureAnchor(text, idx, idx + q.length)!;
    const t0 = performance.now();
    const r = restoreAnchor('inserted ' + text, anchor);
    const ms = performance.now() - t0;
    expect(r.status).toBe('matched');
    expect(ms).toBeLessThan(500);
  });
});
