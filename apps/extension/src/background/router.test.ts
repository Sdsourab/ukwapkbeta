import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '@ukw/database';
import { makeMessage, type ExtensionResponse, type MessagePayload, type MessageType } from '@ukw/domain';
import { handleRaw, type PageState, type RouterContext, type SenderInfo } from './router';

const SELF = 'abcdefghijklmnopabcdefghijklmnop';
let store: DataStore;
let ctx: RouterContext;
let openDashboard: ReturnType<typeof vi.fn<(path?: string) => Promise<void>>>;
let n = 0;

const page: SenderInfo = { extensionId: SELF, url: 'https://news.example/story?id=1', tabId: 1 };
const own: SenderInfo = { extensionId: SELF, url: `chrome-extension://${SELF}/dashboard.html` };

async function send<T extends MessageType>(type: T, payload: MessagePayload<T>, sender: SenderInfo = page): Promise<ExtensionResponse<any>> {
  return handleRaw(ctx, makeMessage(`m${++n}`, type, payload), sender);
}

beforeEach(async () => {
  store = await new DataStore({ name: `ext-${++n}-${Math.random()}`, broadcast: false }).open();
  openDashboard = vi.fn<(path?: string) => Promise<void>>().mockResolvedValue(undefined);
  ctx = { store, selfId: SELF, actions: { openDashboard } };
});
afterEach(() => store.close());

const PAGE = { url: 'https://news.example/story?id=1&utm_source=tw', title: 'A story' };
const anchor = { exact: 'The key claim', prefix: 'intro ', suffix: ' follows' };

describe('trust boundary', () => {
  it('rejects other extensions, unknown senders and malformed messages', async () => {
    expect((await handleRaw(ctx, makeMessage('1', 'SEARCH', { query: 'x' }), { extensionId: 'someone-else', url: page.url })).error?.code).toBe('UNAUTHORIZED');
    expect((await handleRaw(ctx, makeMessage('2', 'SEARCH', { query: 'x' }), { extensionId: SELF, url: 'ftp://x' })).error?.code).toBe('UNAUTHORIZED');
    expect((await handleRaw(ctx, makeMessage('3', 'SEARCH', { query: 'x' }), { extensionId: SELF })).error?.code).toBe('UNAUTHORIZED');
    expect((await handleRaw(ctx, { id: '4', type: 'RM_RF', version: 1, payload: {} }, page)).error?.code).toBe('VALIDATION_ERROR');
    expect((await handleRaw(ctx, 'garbage', page)).ok).toBe(false);
    expect((await send('ANNOTATION_DELETE', {} as never)).error?.code).toBe('VALIDATION_ERROR');
  });
  it('binds page identity to the sender origin (a page cannot write for another site)', async () => {
    const r = await send('ANNOTATION_CREATE', { page: { url: 'https://bank.example/account' }, type: 'highlight', anchor });
    expect(r.error?.code).toBe('FORBIDDEN');
    expect(await store.documents.list()).toHaveLength(0);
    // …but the user's own dashboard may act on any URL
    const ok = await send('ANNOTATION_CREATE', { page: { url: 'https://bank.example/account' }, type: 'highlight', anchor }, own);
    expect(ok.ok).toBe(true);
  });
  it('never leaks internal error details for unexpected failures', async () => {
    vi.spyOn(store.notes, 'save').mockRejectedValue(new Error('SQLITE_CORRUPT at /secret/path'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await send('NOTE_SAVE', { body: 'x', format: 'markdown' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INTERNAL_ERROR');
  });
});

describe('privacy: browsing is not recorded', () => {
  it('DOCUMENT_LOOKUP never creates a document or any row', async () => {
    const before = await store.db.syncQueue.count();
    const r = await send('DOCUMENT_LOOKUP', { url: PAGE.url });
    expect(r.ok).toBe(true);
    expect((r.data as PageState).document).toBeNull();
    expect(await store.documents.list()).toHaveLength(0);
    expect(await store.db.syncQueue.count()).toBe(before);
    expect(await store.db.auditEvents.count()).toBe(0);
  });
  it('flags unannotatable URLs as unsupported', async () => {
    const r = await send('DOCUMENT_LOOKUP', { url: 'chrome://extensions' }, own);
    expect((r.data as PageState).unsupported).toBe(true);
  });
});

describe('annotation lifecycle through messages', () => {
  it('creates a document lazily on first annotation, then restores it by URL on lookup (TC-EXT-01/02)', async () => {
    const created = await send('ANNOTATION_CREATE', { page: PAGE, type: 'highlight', colour: '#8FB8FF', anchor, note: 'why it matters' });
    expect(created.ok).toBe(true);
    expect(created.data.document.normalizedUrl).toBe('https://news.example/story?id=1');
    expect(created.data.annotation.colour).toBe('#8FB8FF');
    // a different tracking param / hash still resolves to the same document
    const look = await send('DOCUMENT_LOOKUP', { url: 'https://news.example/story?id=1&fbclid=zz#sec' });
    const state = look.data as PageState;
    expect(state.document?.id).toBe(created.data.document.id);
    expect(state.annotations).toHaveLength(1);
    expect(state.notesByAnnotation[state.annotations[0]!.id]![0]!.body).toBe('why it matters');
    // a second annotation reuses the document
    await send('ANNOTATION_CREATE', { page: PAGE, type: 'underline', anchor: { exact: 'another passage' } });
    expect(await store.documents.list()).toHaveLength(1);
  });

  it('applies the user default colour when none is sent', async () => {
    await store.settings.set('defaultColour', '#FF9FC2');
    const r = await send('ANNOTATION_CREATE', { page: PAGE, type: 'highlight', anchor });
    expect(r.data.annotation.colour).toBe('#FF9FC2');
  });

  it('updates colour/type, reports orphaned anchors, deletes and restores', async () => {
    const { data } = await send('ANNOTATION_CREATE', { page: PAGE, type: 'highlight', anchor });
    const id = data.annotation.id as string;
    expect((await send('ANNOTATION_UPDATE', { id, patch: { colour: '#C3A4FF', type: 'underline' } })).data).toMatchObject({ colour: '#C3A4FF', type: 'underline' });
    expect((await send('ANNOTATION_UPDATE', { id, patch: { colour: 'javascript:1' as never } })).error?.code).toBe('VALIDATION_ERROR');
    expect((await send('ANCHOR_REPORT', { annotationId: id, status: 'orphaned' })).data.status).toBe('orphaned');
    expect((await send('ANCHOR_REPORT', { annotationId: id, status: 'active', confidence: 0.9, strategy: 'exact-context' })).data.status).toBe('active');
    await send('ANNOTATION_DELETE', { id });
    expect(((await send('DOCUMENT_LOOKUP', { url: PAGE.url })).data as PageState).annotations).toHaveLength(0);
    await send('ANNOTATION_RESTORE_DELETED', { id });
    expect(((await send('DOCUMENT_LOOKUP', { url: PAGE.url })).data as PageState).annotations).toHaveLength(1);
    expect((await send('ANNOTATION_UPDATE', { id: 'ghost', patch: { isFavorite: true } })).error?.code).toBe('NOT_FOUND');
  });

  it('undo/redo operate on the store history', async () => {
    const { data } = await send('ANNOTATION_CREATE', { page: PAGE, type: 'highlight', anchor });
    expect((await send('HISTORY_UNDO', {})).data.label).toMatch(/Create/);
    expect(await store.annotations.get(data.annotation.id)).toBeUndefined();
    await send('HISTORY_REDO', {});
    expect(await store.annotations.get(data.annotation.id)).toBeDefined();
    expect((await send('HISTORY_REDO', {})).data.label).toBeNull();
  });

  it('page-level notes create the document and are returned as page notes', async () => {
    await send('PAGE_NOTE_CREATE', { page: PAGE, body: 'overall thoughts' });
    const state = (await send('DOCUMENT_LOOKUP', { url: PAGE.url })).data as PageState;
    expect(state.pageNotes.map((x) => x.body)).toEqual(['overall thoughts']);
  });

  it('autosaves notes by id and deletes them', async () => {
    const { data } = await send('ANNOTATION_CREATE', { page: PAGE, type: 'highlight', anchor });
    const first = await send('NOTE_SAVE', { documentId: data.document.id, annotationId: data.annotation.id, body: 'v1', format: 'markdown' });
    const second = await send('NOTE_SAVE', { id: first.data.id, body: 'v2', format: 'markdown' });
    expect(second.data.body).toBe('v2');
    expect(await store.notes.count()).toBe(1);
    await send('NOTE_DELETE', { id: first.data.id });
    expect(await store.notes.count()).toBe(0);
  });
});

describe('settings, search, graphs, dashboard', () => {
  it('reads and validates settings', async () => {
    expect((await send('SETTINGS_GET', {})).data.theme).toBe('system');
    expect((await send('SETTINGS_UPDATE', { key: 'theme', value: 'dim' })).data.theme).toBe('dim');
    expect((await send('SETTINGS_UPDATE', { key: 'theme', value: 'neon' })).error?.code).toBe('VALIDATION_ERROR');
    expect((await send('SETTINGS_GET', { key: 'theme' })).data).toEqual({ theme: 'dim' });
  });
  it('searches the library', async () => {
    await send('ANNOTATION_CREATE', { page: PAGE, type: 'highlight', anchor: { exact: 'Quokkas are marsupials' } });
    const r = await send('SEARCH', { query: 'marsupials' });
    expect(r.data.length).toBeGreaterThan(0);
  });
  it('adds an annotation to a graph as a source-linked node and lists/loads graphs', async () => {
    const { data } = await send('ANNOTATION_CREATE', { page: PAGE, type: 'highlight', anchor });
    const g = (await send('GRAPH_CREATE', { title: 'Evidence' })).data;
    expect((await send('GRAPH_LIST', {})).data.map((x: { id: string }) => x.id)).toContain(g.id);
    const node = (await send('GRAPH_ADD_NODE_FROM_ANNOTATION', { annotationId: data.annotation.id, graphId: g.id })).data;
    expect(node.sourceRef.annotationId).toBe(data.annotation.id);
    await send('GRAPH_ADD_NODE', { graphId: g.id, label: 'Free idea' });
    const loaded = (await send('GRAPH_LOAD', { graphId: g.id })).data;
    expect(loaded.nodes).toHaveLength(2);
    const xs = loaded.nodes.map((x: { position: { x: number } }) => x.position.x);
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs)); // the second node was placed to the right
    expect((await send('GRAPH_ADD_NODE_FROM_ANNOTATION', { annotationId: 'ghost', graphId: g.id })).error?.code).toBe('NOT_FOUND');
  });
  it('reports honestly that sync is not configured', async () => {
    expect((await send('SYNC_REQUEST', {})).data.configured).toBe(false);
  });
  it('opens the dashboard via the injected action', async () => {
    await send('OPEN_DASHBOARD', { path: '/graphs' });
    expect(openDashboard).toHaveBeenCalledWith('/graphs');
  });
});
