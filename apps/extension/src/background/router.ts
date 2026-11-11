import type { DataStore } from '@ukw/database';
import {
  UkwError,
  newId,
  type ErrorCode,
  normalizeUrl,
  parseMessage,
  toUkwError,
  type DocumentRecord,
  type ExtensionResponse,
  type MessagePayload,
  type MessageType,
  type NoteRecord,
  type SettingKey,
} from '@ukw/domain';

/** What we know about who sent a message (derived from chrome.runtime.MessageSender, never from the payload). */
export interface SenderInfo {
  extensionId?: string;
  /** URL of the frame that sent the message. */
  url?: string;
  tabId?: number;
}

export interface RouterActions {
  openDashboard(path?: string): Promise<void>;
}

export interface RouterContext {
  store: DataStore;
  /** chrome.runtime.id of this extension. */
  selfId: string;
  actions: RouterActions;
}

const isWeb = (u?: string) => !!u && /^https?:\/\//i.test(u);
const isOwnPage = (u: string | undefined, id: string) => !!u && u.startsWith(`chrome-extension://${id}/`);

function originOf(u: string): string | null {
  try { return new URL(u).origin; } catch { return null; }
}

/** Messages that carry a page URL must come from a frame of that same origin. */
function assertPageBelongsToSender(pageUrl: string, sender: SenderInfo, ctx: RouterContext): void {
  if (isOwnPage(sender.url, ctx.selfId)) return; // dashboard/popup act for the user, not for a page
  const a = originOf(pageUrl);
  const b = sender.url ? originOf(sender.url) : null;
  if (!a || !b || a !== b) throw new UkwError('FORBIDDEN', 'Page identity does not match the sender.');
}

export interface PageState {
  document: DocumentRecord | null;
  annotations: Awaited<ReturnType<DataStore['annotations']['listByDocument']>>;
  notesByAnnotation: Record<string, NoteRecord[]>;
  pageNotes: NoteRecord[];
  /** True when the URL cannot be annotated at all (chrome://, file without access, …). */
  unsupported: boolean;
}

async function lookup(store: DataStore, p: MessagePayload<'DOCUMENT_LOOKUP'>): Promise<PageState> {
  const norm = normalizeUrl(p.url);
  if (!norm) return { document: null, annotations: [], notesByAnnotation: {}, pageNotes: [], unsupported: true };
  let doc = p.platform && p.externalId ? await store.documents.findByExternalId(p.platform, p.externalId) : undefined;
  doc ??= await store.documents.findByNormalizedUrl(norm.normalized);
  if (!doc || doc.deletedAt) return { document: null, annotations: [], notesByAnnotation: {}, pageNotes: [], unsupported: false };
  const [annotations, notes] = await Promise.all([store.annotations.listByDocument(doc.id), store.notes.listForDocument(doc.id)]);
  const notesByAnnotation: Record<string, NoteRecord[]> = {};
  for (const n of notes) if (n.annotationId) (notesByAnnotation[n.annotationId] ??= []).push(n);
  return { document: doc, annotations, notesByAnnotation, pageNotes: notes.filter((n) => !n.annotationId), unsupported: false };
}

type Handler<T extends MessageType> = (ctx: RouterContext, payload: MessagePayload<T>, sender: SenderInfo) => Promise<unknown>;
type Handlers = { [K in MessageType]: Handler<K> };

const handlers: Handlers = {
  DOCUMENT_LOOKUP: async ({ store }, p, sender) => { void sender; return lookup(store, p); },

  ANNOTATION_CREATE: async (ctx, p, sender) => {
    assertPageBelongsToSender(p.page.url, sender, ctx);
    const { store } = ctx;
    const doc = await store.documents.upsertFromPage(p.page);
    const colour = p.colour ?? (await store.settings.get('defaultColour'));
    const { annotation, note } = await store.annotations.createAnnotation({ documentId: doc.id, type: p.type, colour, anchor: p.anchor, note: p.note, label: p.label, location: p.location });
    return { document: doc, annotation, note };
  },

  PAGE_NOTE_CREATE: async (ctx, p, sender) => {
    assertPageBelongsToSender(p.page.url, sender, ctx);
    const doc = await ctx.store.documents.upsertFromPage(p.page);
    const note = await ctx.store.notes.save({ documentId: doc.id, body: p.body });
    return { document: doc, note };
  },

  ANNOTATION_UPDATE: async ({ store }, p) => {
    const { colour, ...rest } = p.patch;
    let a = await store.annotations.require(p.id);
    if (colour) a = await store.annotations.setColour(p.id, colour);
    if (Object.keys(rest).length) a = await store.annotations.update(p.id, rest as never);
    return a;
  },
  ANNOTATION_DELETE: async ({ store }, p) => { await store.annotations.remove(p.id); return { id: p.id }; },
  ANNOTATION_RESTORE_DELETED: async ({ store }, p) => store.annotations.restore(p.id),
  ANNOTATION_LIST_FOR_DOCUMENT: async ({ store }, p) => store.annotations.listByDocument(p.documentId),

  NOTE_SAVE: async ({ store }, p) => store.notes.save(p),
  NOTE_LIST_FOR_DOCUMENT: async ({ store }, p) => store.notes.listForDocument(p.documentId),
  NOTE_DELETE: async ({ store }, p) => { await store.notes.remove(p.id); return { id: p.id }; },

  ANCHOR_REPORT: async ({ store }, p) => {
    const a = await store.annotations.reportRestoration(p.annotationId, { status: p.status, confidence: p.confidence, strategy: p.strategy as never });
    return a ?? null;
  },

  HISTORY_UNDO: async ({ store }) => ({ label: await store.undo() }),
  HISTORY_REDO: async ({ store }) => ({ label: await store.redo() }),

  SEARCH: async ({ store }, p) => store.search.search({ query: p.query, limit: p.limit ?? 20 }),

  SETTINGS_GET: async ({ store }, p) => (p.key ? { [p.key]: await store.settings.get(p.key as SettingKey) } : store.settings.getAll()),
  SETTINGS_UPDATE: async ({ store }, p, sender) => {
    // Only extension pages (dashboard/popup) and the user's own content-script UI may change settings; keys are validated by the repository.
    void sender;
    await store.settings.set(p.key as SettingKey, p.value as never);
    return store.settings.getAll();
  },

  SYNC_REQUEST: async () => ({ configured: false, message: 'Cloud sync is not configured in this build.' }),

  GRAPH_LIST: async ({ store }) => (await store.graphs.list()).filter((g) => !g.isArchived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((g) => ({ id: g.id, title: g.title, kind: g.kind, updatedAt: g.updatedAt })),
  GRAPH_LOAD: async ({ store }, p) => { const { graph, nodes, edges } = await store.graphs.load(p.graphId); return { graph, nodes, edges }; },
  GRAPH_CREATE: async ({ store }, p) => store.graphs.createGraph({ title: p.title }),
  GRAPH_ADD_NODE: async ({ store }, p) => {
    const { nodes } = await store.graphs.load(p.graphId);
    const maxX = nodes.length ? Math.max(...nodes.map((n) => n.position.x)) : -300;
    return store.graphs.addNode(p.graphId, { label: p.label, position: { x: maxX + 300, y: 0 } });
  },
  GRAPH_ADD_NODE_FROM_ANNOTATION: async ({ store }, p) => {
    const { nodes } = await store.graphs.load(p.graphId);
    const maxX = nodes.length ? Math.max(...nodes.map((n) => n.position.x)) : -300;
    return store.graphs.addSourceNode(p.graphId, { annotationId: p.annotationId }, { x: maxX + 300, y: 0 });
  },

  OPEN_DASHBOARD: async (ctx, p) => { await ctx.actions.openDashboard(p?.path); return { ok: true }; },
};

/**
 * Entry point for every runtime message: authenticate the sender, validate the envelope and payload,
 * run the handler, and always answer with a structured response (never throw to the caller).
 */
export async function handleRaw(ctx: RouterContext, raw: unknown, sender: SenderInfo): Promise<ExtensionResponse> {
  const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : newId();
  const fail = (code: ErrorCode, message: string): ExtensionResponse => ({ id, ok: false, error: { code, message, recoverable: true } });

  if (sender.extensionId !== ctx.selfId) return fail('UNAUTHORIZED', 'Messages are only accepted from this extension.');
  if (!isWeb(sender.url) && !isOwnPage(sender.url, ctx.selfId)) return fail('UNAUTHORIZED', 'Unrecognised sender.');

  const parsed = parseMessage(raw);
  if (!parsed.ok) return fail('VALIDATION_ERROR', `Invalid message (${parsed.reason}).`);
  const { type, payload } = parsed.message;

  try {
    const data = await (handlers[type] as Handler<typeof type>)(ctx, payload as never, sender);
    return { id, ok: true, data };
  } catch (err) {
    const e = toUkwError(err);
    if (e.code === 'INTERNAL_ERROR') console.error('[ukw] handler failed', type, err);
    return { id, ok: false, error: e.toJSON() };
  }
}
