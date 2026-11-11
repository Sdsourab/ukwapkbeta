// @vitest-environment jsdom
import axe from 'axe-core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '@ukw/database';
import { handleRaw } from '../../background/router';
import { adapterFor } from '../adapters';
import { createInProcessClient } from '../client';
import { PageController } from '../controller';
import type { HighlightRenderer, PaintEntry } from '../highlighter';
import { mountUi, type MountedUi } from './mount';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SELF = 'abcdefghijklmnopabcdefghijklmnop';
class Fake implements HighlightRenderer { readonly kind = 'none' as const; paint(_e: PaintEntry[]) {} clear() {} hitTest() { return null; } destroy() {} }

let store: DataStore; let controller: PageController; let ui: MountedUi | null = null;

beforeEach(async () => {
  (Range.prototype as any).getBoundingClientRect = () => ({ top: 200, left: 100, width: 120, height: 20, bottom: 220, right: 220, x: 100, y: 200 });
  (Range.prototype as any).getClientRects = () => [];
  window.scrollTo = vi.fn() as never;
  history.pushState({}, '', '/a11y');
  document.body.innerHTML = '<article><p id="p">Reading research shows that attention drifts during long passages of text.</p></article>';
  store = await new DataStore({ name: `ext-a11y-${Math.random()}`, broadcast: false }).open();
  const ctx = { store, selfId: SELF, actions: { openDashboard: async () => undefined } };
  controller = new PageController({ doc: document, win: window, client: createInProcessClient((raw) => handleRaw(ctx, raw, { extensionId: SELF, url: location.href })), adapterFor, renderer: new Fake() });
  await controller.start();
  await act(async () => { ui = mountUi(controller, { mode: 'open' }); });
});
afterEach(async () => { await act(async () => { ui?.unmount(); }); controller.destroy(); store.close(); document.body.innerHTML = ''; });

const flush = (ms = 60) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function audit(label: string) {
  const res = await axe.run(ui!.shadow as unknown as Element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  expect(res.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `${label}: violations`).toEqual([]);
}

describe('in-page extension UI accessibility', () => {
  it('toolbar, popover, sidebar (every tab) and palette have no WCAG A/AA violations', async () => {
    const r = document.createRange(); r.setStart(document.querySelector('#p')!.firstChild!, 0); r.setEnd(document.querySelector('#p')!.firstChild!, 22);
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(r);
    await act(async () => { document.dispatchEvent(new Event('selectionchange')); await new Promise((x) => setTimeout(x, 140)); });
    expect(ui!.shadow.querySelector('.ukw-tb')).not.toBeNull();
    await audit('toolbar');

    const ann = await controller.createFromSelection('highlight');
    await flush();
    await act(async () => { controller.setActive(ann!.id, true); });
    await flush();
    expect(ui!.shadow.querySelector('.ukw-pop')).not.toBeNull();
    await audit('popover');

    await act(async () => { controller.setActive(null); controller.toggleSidebar(true); });
    await flush();
    for (const tab of ['Highlights', 'Notes', 'Graph', 'Sources']) {
      const btn = Array.from(ui!.shadow.querySelectorAll<HTMLElement>('[role="tab"]')).find((t) => t.textContent?.startsWith(tab))!;
      await act(async () => { btn.click(); });
      await flush(80);
      await audit(`sidebar ${tab}`);
    }
    await act(async () => { controller.toggleSidebar(false); controller.togglePalette(true); });
    await flush();
    await audit('palette');
  });
});
