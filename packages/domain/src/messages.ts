import { z } from 'zod';

/**
 * Extension messaging contract (docs/08 §8.2). The background worker validates every
 * message against these schemas and checks the sender; page-origin messages are never trusted.
 */

export const MESSAGE_VERSION = 1 as const;

export interface ExtensionMessage<T = unknown> {
  id: string;
  type: string;
  version: typeof MESSAGE_VERSION;
  payload: T;
  sentAt: string;
}

export interface ExtensionResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; recoverable: boolean };
}

const strategySchema = z.enum(['offset', 'exact-context', 'exact-unique', 'loose-context', 'message', 'dom-path', 'manual']);

const anchorSchema = z.object({
  exact: z.string().min(1).max(20_000),
  prefix: z.string().max(500).optional(),
  suffix: z.string().max(500).optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  domPath: z.string().max(2000).optional(),
  selector: z.string().max(2000).optional(),
  textFingerprint: z.string().max(64).optional(),
  messageId: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1).optional(),
  strategy: strategySchema.optional(),
});

const colour = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

/** Identity of the page an annotation belongs to. Sent only when the user actually annotates (never on mere visits). */
export const pageSchema = z.object({
  url: z.string().max(4000),
  title: z.string().max(1000).optional(),
  platform: z.string().max(60).optional(),
  externalId: z.string().max(200).optional(),
  sourceType: z.enum(['web', 'conversation', 'pdf', 'manual']).optional(),
  favicon: z.string().max(4000).optional(),
});

/** Read-only lookup: must never create anything, so browsing history is not recorded. */
export const pageLookupSchema = z.object({
  url: z.string().max(4000),
  platform: z.string().max(60).optional(),
  externalId: z.string().max(200).optional(),
});

export const annotationCreateSchema = z.object({
  page: pageSchema,
  type: z.enum(['highlight', 'underline', 'strike', 'bookmark', 'sticky']),
  colour: colour.optional(),
  anchor: anchorSchema.nullable(),
  note: z.string().max(200_000).optional(),
  label: z.string().max(300).optional(),
  location: z
    .object({ pageNumber: z.number().int().positive().optional(), scrollRatio: z.number().min(0).max(1).optional(), headingId: z.string().max(200).optional() })
    .optional(),
});

export const annotationUpdateSchema = z.object({
  id: z.string().min(1),
  patch: z.object({
    colour: colour.optional(),
    type: z.enum(['highlight', 'underline', 'strike']).optional(),
    status: z.enum(['active', 'orphaned', 'archived']).optional(),
    isFavorite: z.boolean().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    anchor: anchorSchema.nullable().optional(),
    label: z.string().max(300).optional(),
  }),
});

export const idSchema = z.object({ id: z.string().min(1) });
export const documentIdSchema = z.object({ documentId: z.string().min(1) });

export const noteSaveSchema = z.object({
  id: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  annotationId: z.string().min(1).optional(),
  title: z.string().max(500).optional(),
  body: z.string().max(200_000),
  format: z.enum(['plain', 'markdown']).default('markdown'),
});

export const settingsUpdateSchema = z.object({ key: z.string().min(1).max(80), value: z.unknown() });
export const settingsGetSchema = z.object({ key: z.string().min(1).max(80).optional() });

export const MESSAGE_SCHEMAS = {
  DOCUMENT_LOOKUP: pageLookupSchema,
  PAGE_NOTE_CREATE: z.object({ page: pageSchema, body: z.string().max(200_000) }),
  ANNOTATION_CREATE: annotationCreateSchema,
  ANNOTATION_UPDATE: annotationUpdateSchema,
  ANNOTATION_DELETE: idSchema,
  ANNOTATION_RESTORE_DELETED: idSchema,
  ANNOTATION_LIST_FOR_DOCUMENT: documentIdSchema,
  NOTE_SAVE: noteSaveSchema,
  NOTE_LIST_FOR_DOCUMENT: documentIdSchema,
  NOTE_DELETE: idSchema,
  ANCHOR_REPORT: z.object({
    annotationId: z.string().min(1),
    status: z.enum(['active', 'orphaned']),
    confidence: z.number().min(0).max(1).optional(),
    strategy: strategySchema.optional(),
  }),
  SEARCH: z.object({ query: z.string().max(500), limit: z.number().int().min(1).max(50).optional() }),
  GRAPH_LOAD: z.object({ graphId: z.string().min(1) }),
  GRAPH_CREATE: z.object({ title: z.string().max(200).optional() }),
  GRAPH_ADD_NODE: z.object({ graphId: z.string().min(1), label: z.string().min(1).max(500) }),
  SYNC_REQUEST: z.object({}).optional(),
  SETTINGS_GET: settingsGetSchema,
  SETTINGS_UPDATE: settingsUpdateSchema,
  HISTORY_UNDO: z.object({}).optional(),
  HISTORY_REDO: z.object({}).optional(),
  GRAPH_LIST: z.object({}).optional(),
  GRAPH_ADD_NODE_FROM_ANNOTATION: z.object({ annotationId: z.string().min(1), graphId: z.string().min(1) }),
  OPEN_DASHBOARD: z.object({ path: z.string().max(200).optional() }).optional(),
} as const;

export type MessageType = keyof typeof MESSAGE_SCHEMAS;

/** Commands the background (shortcuts, context menu, popup) sends TO a tab's content script. */
export const CONTENT_COMMANDS = ['toggle-sidebar', 'highlight-selection', 'add-note', 'add-bookmark', 'open-palette', 'get-status', 'refresh'] as const;
export type ContentCommand = (typeof CONTENT_COMMANDS)[number];
export interface ContentCommandMessage { ukw: 'command'; command: ContentCommand }
export interface ChangeBroadcast { ukw: 'changed'; entityTypes: string[] }

export function isContentCommand(v: unknown): v is ContentCommandMessage {
  return typeof v === 'object' && v !== null && (v as { ukw?: unknown }).ukw === 'command' && (CONTENT_COMMANDS as readonly unknown[]).includes((v as { command?: unknown }).command);
}
export type MessagePayload<T extends MessageType> = z.infer<(typeof MESSAGE_SCHEMAS)[T]>;

export function isMessageType(value: unknown): value is MessageType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MESSAGE_SCHEMAS, value);
}

export interface ParsedMessage {
  id: string;
  type: MessageType;
  payload: unknown;
}

/** Validates an unknown value as an ExtensionMessage with a known type and payload shape. */
export function parseMessage(raw: unknown): { ok: true; message: ParsedMessage } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'not an object' };
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id.length === 0 || m.id.length > 100) return { ok: false, reason: 'bad id' };
  if (m.version !== MESSAGE_VERSION) return { ok: false, reason: 'unsupported version' };
  if (!isMessageType(m.type)) return { ok: false, reason: 'unknown type' };
  const schema = MESSAGE_SCHEMAS[m.type] as z.ZodType;
  const parsed = schema.safeParse(m.payload);
  if (!parsed.success) return { ok: false, reason: `invalid payload: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  return { ok: true, message: { id: m.id, type: m.type, payload: parsed.data } };
}

export function makeMessage<T extends MessageType>(id: string, type: T, payload: MessagePayload<T>): ExtensionMessage<MessagePayload<T>> {
  return { id, type, version: MESSAGE_VERSION, payload, sentAt: new Date().toISOString() };
}
