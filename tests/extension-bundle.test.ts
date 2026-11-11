// @vitest-environment jsdom
// Runs the BUILT extension bundles (apps/extension/dist) against a stubbed chrome API.
// Skipped automatically when the extension has not been built (npm run build:extension).
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { makeMessage, newId } from '@ukw/domain';

const dist = path.resolve(__dirname, '../apps/extension/dist');
const built = fs.existsSync(path.join(dist, 'content.js')) && fs.existsSync(path.join(dist, 'background.js'));
const SELF = 'abcdefghijklmnopabcdefghijklmnop';

type Listener = (msg: unknown, sender: { id?: string; url?: string; tab?: { id: number } }, send: (r: unknown) => void) => boolean | void;

describe.skipIf(!built)('built extension bundles', () => {
  const bgListeners: Listener[] = [];
  const contentListeners: Listener[] = [];
  const created: unknown[] = [];
  let phase: 'background' | 'content' = 'background';

  const sendToBackground = (msg: unknown) =>
    new Promise((resolve) => {
      const l = bgListeners[0]!;
      const keep = l(msg, { id: SELF, url: location.href, tab: { id: 1 } }, resolve);
      if (!keep) resolve(undefined);
    });

  beforeAll(async () => {
    (globalThis as any).chrome = {
      runtime: {
        id: SELF,
        sendMessage: vi.fn(sendToBackground),
        getURL: (p: string) => `chrome-extension://${SELF}/${p}`,
        onMessage: { addListener: (l: Listener) => (phase === 'background' ? bgListeners : contentListeners).push(l) },
        onInstalled: { addListener: vi.fn() },
      },
      tabs: { query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined), create: vi.fn(async (o: unknown) => { created.push(o); }) },
      commands: { onCommand: { addListener: vi.fn() } },
      contextMenus: { create: vi.fn(), removeAll: vi.fn((cb: () => void) => cb()), onClicked: { addListener: vi.fn() } },
    };
    (Range.prototype as any).getBoundingClientRect = () => ({ top: 100, left: 50, width: 120, height: 20, bottom: 120, right: 170, x: 50, y: 100 });
    (Range.prototype as any).getClientRects = () => [];
    window.scrollTo = vi.fn() as never;
    // Evaluate the real service-worker bundle (it opens the 'ukw-ext' database in fake-indexeddb).
    phase = 'background';
    (0, eval)(fs.readFileSync(path.join(dist, 'background.js'), 'utf8'));
  });
  afterAll(() => { delete (globalThis as any).chrome; });

  const loadContent = () => { phase = 'content'; delete (window as any).__ukwLoaded; (0, eval)(fs.readFileSync(path.join(dist, 'content.js'), 'utf8')); };
  const flush = async (ms = 50) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
  const select = (el: Element, from: number, to: number) => { const r = document.createRange(); r.setStart(el.firstChild!, from); r.setEnd(el.firstChild!, to); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r); };
  const dbAnnotations = async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const rq = indexedDB.open('ukw-ext'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    const rows = await new Promise<any[]>((res, rej) => { const rq = db.transaction('annotations').objectStore('annotations').getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    const docs = await new Promise<any[]>((res, rej) => { const rq = db.transaction('documents').objectStore('documents').getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    db.close();
    return { rows, docs };
  };

  it('the service worker bundle registers its listeners and answers validated messages', async () => {
    expect(bgListeners).toHaveLength(1);
    const ok = (await sendToBackground(makeMessage(newId(), 'SETTINGS_GET', {}))) as any;
    expect(ok.ok).toBe(true);
    expect(ok.data.theme).toBe('system');
    const bad = (await sendToBackground({ id: 'x', type: 'DROP_TABLE', version: 1, payload: {} })) as any;
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('VALIDATION_ERROR');
    // unknown senders are refused
    const refused = await new Promise<any>((resolve) => bgListeners[0]!(makeMessage('1', 'SETTINGS_GET', {}), { id: 'other-extension', url: location.href }, resolve));
    expect(refused.error.code).toBe('UNAUTHORIZED');
  });

  it('the content bundle: Alt+H on a selection saves a highlight through the real worker, and nothing is saved by merely visiting', async () => {
    history.pushState({}, '', '/bundle-article');
    document.body.innerHTML = '<article><p id="p1">Reading research shows that attention drifts during long passages of text.</p></article>';
    loadContent();
    await flush(150);
    expect((await dbAnnotations()).docs).toHaveLength(0); // visit recorded nothing

    select(document.querySelector('#p1')!, 0, 'Reading research shows'.length);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', altKey: true, bubbles: true, cancelable: true })); });
    await flush(250);
    const { rows, docs } = await dbAnnotations();
    expect(rows).toHaveLength(1);
    expect(rows[0].anchor.exact).toBe('Reading research shows');
    expect(rows[0].type).toBe('highlight');
    expect(docs[0].normalizedUrl).toBe('http://localhost:3000/bundle-article');
    // the lazily mounted UI host exists, is excluded from page text, and its content is not in the light DOM
    const host = document.documentElement.querySelector('[data-ukw-ui]');
    expect(host).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/Highlight saved/);
  });

  it('the content bundle answers status requests only from this extension', async () => {
    const l = contentListeners[0]!;
    expect(l).toBeDefined();
    const res = await new Promise<any>((resolve) => { const keep = l({ ukw: 'command', command: 'get-status' }, { id: SELF }, resolve); if (keep === false) setTimeout(() => resolve(undefined), 20); });
    expect(res).toMatchObject({ annotations: 1, hostname: 'localhost', disabled: false });
    const ignored = await new Promise<any>((resolve) => { l({ ukw: 'command', command: 'get-status' }, { id: 'evil' }, resolve); setTimeout(() => resolve('no-response'), 30); });
    expect(ignored).toBe('no-response');
  });

  it('after a "reload" the content bundle restores the highlight from the database (offset strategy)', async () => {
    document.body.innerHTML = '<article><p id="p1">Reading research shows that attention drifts during long passages of text.</p></article>';
    loadContent();
    await flush(400);
    const { rows } = await dbAnnotations();
    expect(rows[0].status).toBe('active');
    expect(rows[0].anchor.strategy).toBe('offset');
  });

  it('OPEN_DASHBOARD from an extension page opens the dashboard tab', async () => {
    const res = await new Promise<any>((resolve) => bgListeners[0]!(makeMessage('d', 'OPEN_DASHBOARD', { path: '/graphs' }), { id: SELF, url: `chrome-extension://${SELF}/popup.html` }, resolve));
    expect(res.ok).toBe(true);
    expect(created).toEqual([{ url: `chrome-extension://${SELF}/dashboard.html#/graphs` }]);
  });
});
