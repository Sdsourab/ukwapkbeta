// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildTextMap, captureFromRange, offsetsFromRange, rangeFromOffsets, restoreInMap, UI_ATTRIBUTE } from './index';

function page(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('buildTextMap', () => {
  it('concatenates text nodes, separates blocks and skips scripts/styles/hidden/UI', () => {
    const body = page(`
      <h1>Title</h1>
      <p>First <b>bold</b> text.</p>
      <script>var secret = 1;</script><style>.x{}</style>
      <div hidden>Hidden stuff</div>
      <div ${UI_ATTRIBUTE}>Extension UI</div>
      <p>Second paragraph.</p>`);
    const map = buildTextMap(body);
    expect(map.text).toBe('Title\nFirst bold text.\nSecond paragraph.');
  });
});

describe('range <-> offsets round trip', () => {
  it('maps nested formatting inside a sentence', () => {
    const body = page('<p>Alpha <em>beta <strong>gamma</strong></em> delta epsilon.</p>');
    const map = buildTextMap(body);
    const start = map.text.indexOf('beta');
    const end = map.text.indexOf('delta') + 'delta'.length;
    const range = rangeFromOffsets(map, start, end)!;
    expect(range.toString()).toBe('beta gamma delta');
    expect(offsetsFromRange(map, range)).toEqual({ start, end });
  });

  it('handles element-boundary selections (e.g. select-all inside a paragraph)', () => {
    const body = page('<p id="a">One two three.</p><p id="b">Four five six.</p>');
    const map = buildTextMap(body);
    const range = document.createRange();
    range.selectNodeContents(body.querySelector('#a')!);
    const offsets = offsetsFromRange(map, range)!;
    expect(map.text.slice(offsets.start, offsets.end).trim()).toBe('One two three.');
  });

  it('spans multiple blocks and ignores the virtual separator when building a Range', () => {
    const body = page('<p>Ends here.</p><p>Starts there.</p>');
    const map = buildTextMap(body);
    const start = map.text.indexOf('here.');
    const end = map.text.indexOf('Starts') + 6;
    const range = rangeFromOffsets(map, start, end)!;
    expect(range.toString()).toBe('here.Starts');
  });
});

describe('capture + restore against a changing DOM', () => {
  const html = `<article>
    <p>Reading research shows that attention drifts during long passages.</p>
    <p>Participants who highlighted <em>key sentences</em> recalled more details after one week.</p>
    <p>The authors recommend selective marking combined with brief notes.</p>
  </article>`;

  it('captures a selection and restores it after an inserted paragraph', () => {
    const body = page(html);
    const map = buildTextMap(body);
    const em = body.querySelector('em')!.firstChild as Text;
    const range = document.createRange();
    const p2 = body.querySelectorAll('p')[1]!;
    range.setStart(p2.firstChild!, 0);
    range.setEnd(em, em.length);
    const anchor = captureFromRange(map, range)!;
    expect(anchor.exact).toBe('Participants who highlighted key sentences');

    page(html.replace('<article>', '<article><p>A banner paragraph that was added later.</p>'));
    const map2 = buildTextMap(document.body);
    const restored = restoreInMap(map2, anchor);
    expect(restored.result.status).toBe('matched');
    expect(restored.range?.toString().replace(/\s+/g, ' ')).toBe('Participants who highlighted key sentences');
  });

  it('reports orphaned when the passage disappears and never moves silently', () => {
    const body = page(html);
    const map = buildTextMap(body);
    const range = document.createRange();
    const p3 = body.querySelectorAll('p')[2]!;
    range.selectNodeContents(p3);
    const anchor = captureFromRange(map, range)!;
    page(html.replace('The authors recommend selective marking combined with brief notes.', 'The authors disagree and propose nothing.'));
    const restored = restoreInMap(buildTextMap(document.body), anchor);
    expect(restored.result.status).toBe('orphaned');
    expect(restored.range).toBeNull();
  });

  it('returns null for selections outside the root', () => {
    const body = page('<p>inside</p>');
    const outside = document.createElement('div');
    outside.textContent = 'outside text';
    document.documentElement.appendChild(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    expect(captureFromRange(buildTextMap(body), range)).toBeNull();
    outside.remove();
  });
});
