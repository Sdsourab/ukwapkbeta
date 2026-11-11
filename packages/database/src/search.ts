import type { SearchEntityType, SearchInput, SearchResult } from '@ukw/domain';
import type { StoreContext } from './context';

interface IndexEntry {
  entityType: SearchEntityType;
  id: string;
  title: string;
  /** Lower-cased searchable text. */
  haystack: string;
  /** Original text used for snippets. */
  text: string;
  updatedAt: string;
  documentId?: string;
  graphId?: string;
  colour?: string;
  projectId?: string | null;
  platform?: string;
  tagIds: string[];
  archived: boolean;
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

export function parseQuery(query: string): { phrases: string[]; tokens: string[] } {
  const phrases: string[] = [];
  const rest = query.replace(/"([^"]+)"/g, (_, p: string) => {
    const n = norm(p).trim();
    if (n) phrases.push(n);
    return ' ';
  });
  const tokens = norm(rest).split(/\s+/).filter(Boolean);
  return { phrases, tokens };
}

function snippet(text: string, terms: string[], width = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = norm(flat);
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return flat.slice(0, width) + (flat.length > width ? '…' : '');
  const start = Math.max(0, at - 40);
  const end = Math.min(flat.length, start + width);
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}

/**
 * Local full-text search (docs/07 §7.9). The index is derived data: it is rebuilt lazily from canonical
 * records whenever a change event invalidates it, so corruption or migrations cannot desync it.
 */
export class SearchService {
  private index: IndexEntry[] | null = null;
  private building: Promise<IndexEntry[]> | null = null;
  private version = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly ctx: StoreContext) {
    this.unsubscribe = ctx.subscribe(() => this.invalidate());
  }

  dispose(): void {
    this.unsubscribe();
  }

  invalidate(): void {
    this.version++;
    this.index = null;
  }

  /** Forces a rebuild from canonical tables. */
  async rebuild(): Promise<number> {
    this.invalidate();
    return (await this.ensureIndex()).length;
  }

  private async ensureIndex(): Promise<IndexEntry[]> {
    if (this.index) return this.index;
    const startedAt = this.version;
    if (!this.building) {
      this.building = this.build().then((idx) => {
        // Only keep the result if nothing changed while building.
        if (startedAt === this.version) this.index = idx;
        this.building = null;
        return idx;
      }, (err) => {
        this.building = null;
        throw err;
      });
    }
    return this.building;
  }

  private async build(): Promise<IndexEntry[]> {
    const { db } = this.ctx;
    const [docs, anns, notes, tags, links, graphs, nodes, tasks, refs, projects] = await Promise.all([
      db.documents.toArray(), db.annotations.toArray(), db.notes.toArray(), db.tags.toArray(), db.taggings.toArray(),
      db.graphs.toArray(), db.nodes.toArray(), db.tasks.toArray(), db.references.toArray(), db.researchProjects.toArray(),
    ]);
    const tagName = new Map(tags.filter((t) => !t.deletedAt).map((t) => [t.id, t.name]));
    const tagsOf = new Map<string, string[]>();
    for (const l of links) {
      if (l.deletedAt || !tagName.has(l.tagId)) continue;
      const key = `${l.entityType}:${l.entityId}`;
      (tagsOf.get(key) ?? tagsOf.set(key, []).get(key)!).push(l.tagId);
    }
    const tagText = (type: string, id: string) => (tagsOf.get(`${type}:${id}`) ?? []).map((t) => tagName.get(t)!).join(' ');
    const docById = new Map(docs.map((d) => [d.id, d]));
    const notesByAnn = new Map<string, string[]>();
    for (const n of notes) if (!n.deletedAt && n.annotationId) (notesByAnn.get(n.annotationId) ?? notesByAnn.set(n.annotationId, []).get(n.annotationId)!).push(n.body);

    const out: IndexEntry[] = [];
    const add = (e: Omit<IndexEntry, 'haystack'> & { extra?: string }) => {
      const { extra, ...rest } = e;
      out.push({ ...rest, haystack: norm(`${rest.title}\n${rest.text}\n${extra ?? ''}`) });
    };

    for (const d of docs) {
      if (d.deletedAt) continue;
      add({ entityType: 'document', id: d.id, title: d.title || d.hostname || d.canonicalUrl, text: `${d.canonicalUrl}${d.content ? '\n' + d.content : ''}`, extra: tagText('document', d.id), updatedAt: d.updatedAt, documentId: d.id, projectId: d.projectId, platform: d.platform, tagIds: tagsOf.get(`document:${d.id}`) ?? [], archived: d.isArchived });
    }
    for (const a of anns) {
      if (a.deletedAt) continue;
      const doc = docById.get(a.documentId);
      const noteBodies = (notesByAnn.get(a.id) ?? []).join('\n');
      add({ entityType: 'annotation', id: a.id, title: a.anchor?.exact ?? a.label ?? 'Bookmark', text: `${a.label ?? ''}\n${noteBodies}`, extra: tagText('annotation', a.id), updatedAt: a.updatedAt, documentId: a.documentId, colour: a.colour, projectId: doc?.projectId, platform: doc?.platform, tagIds: tagsOf.get(`annotation:${a.id}`) ?? [], archived: a.status === 'archived' });
    }
    for (const n of notes) {
      if (n.deletedAt) continue;
      const doc = n.documentId ? docById.get(n.documentId) : undefined;
      add({ entityType: 'note', id: n.id, title: n.title || n.body.split('\n')[0]!.slice(0, 80), text: n.body, extra: tagText('note', n.id), updatedAt: n.updatedAt, documentId: n.documentId, projectId: n.projectId ?? doc?.projectId, platform: doc?.platform, tagIds: tagsOf.get(`note:${n.id}`) ?? [], archived: n.isArchived });
    }
    for (const g of graphs) {
      if (g.deletedAt) continue;
      add({ entityType: 'graph', id: g.id, title: g.title, text: g.description ?? '', extra: tagText('graph', g.id), updatedAt: g.updatedAt, graphId: g.id, projectId: g.projectId, tagIds: tagsOf.get(`graph:${g.id}`) ?? [], archived: g.isArchived });
    }
    const liveGraphs = new Map(graphs.filter((g) => !g.deletedAt).map((g) => [g.id, g]));
    for (const n of nodes) {
      if (n.deletedAt || !liveGraphs.has(n.graphId)) continue;
      add({ entityType: 'node', id: n.id, title: n.label, text: n.body ?? '', updatedAt: n.updatedAt, graphId: n.graphId, documentId: n.sourceRef?.documentId, colour: n.colour, projectId: liveGraphs.get(n.graphId)!.projectId, tagIds: [], archived: liveGraphs.get(n.graphId)!.isArchived });
    }
    for (const t of tasks) {
      if (t.deletedAt) continue;
      add({ entityType: 'task', id: t.id, title: t.title, text: t.description ?? '', extra: tagText('task', t.id), updatedAt: t.updatedAt, documentId: t.documentId ?? undefined, projectId: t.projectId, tagIds: tagsOf.get(`task:${t.id}`) ?? [], archived: t.status === 'done' });
    }
    for (const r of refs) {
      if (r.deletedAt) continue;
      const authors = r.authors.map((a) => `${a.given ?? ''} ${a.family}`).join(', ');
      add({ entityType: 'reference', id: r.id, title: r.title, text: [authors, r.journal, r.abstract, r.keywords.join(' '), r.doi, r.findings, r.method, r.personalNotes].filter(Boolean).join('\n'), extra: tagText('reference', r.id), updatedAt: r.updatedAt, documentId: r.documentId ?? undefined, projectId: r.projectId, tagIds: tagsOf.get(`reference:${r.id}`) ?? [], archived: false });
    }
    for (const p of projects) {
      if (p.deletedAt) continue;
      add({ entityType: 'project', id: p.id, title: p.title, text: [p.description, ...p.questions.map((q) => q.text), ...p.objectives.map((q) => q.text), ...p.gaps.map((q) => q.text), ...p.hypotheses.map((q) => q.text), p.methodology].filter(Boolean).join('\n'), updatedAt: p.updatedAt, projectId: p.id, tagIds: [], archived: p.status === 'archived' });
    }
    return out;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const { phrases, tokens } = parseQuery(input.query ?? '');
    const hasQuery = phrases.length + tokens.length > 0;
    const index = await this.ensureIndex();
    const limit = input.limit ?? 100;
    const results: SearchResult[] = [];

    for (const e of index) {
      if (input.types?.length && !input.types.includes(e.entityType)) continue;
      if (!input.includeArchived && e.archived) continue;
      if (input.documentId && e.documentId !== input.documentId) continue;
      if (input.projectId && e.projectId !== input.projectId) continue;
      if (input.platform && e.platform !== input.platform) continue;
      if (input.colour && e.colour?.toLowerCase() !== input.colour.toLowerCase()) continue;
      if (input.tagIds?.length && !input.tagIds.every((t) => e.tagIds.includes(t))) continue;
      if (input.from && e.updatedAt < input.from) continue;
      if (input.to && e.updatedAt > input.to) continue;

      let score = 0;
      if (hasQuery) {
        if (!phrases.every((p) => e.haystack.includes(p)) || !tokens.every((t) => e.haystack.includes(t))) continue;
        const title = norm(e.title);
        for (const t of [...phrases, ...tokens]) {
          score += title.includes(t) ? 5 : 1;
          if (title === t) score += 5;
        }
        score += 2 * phrases.length; // an exact phrase is a stronger signal than loose words
      }
      results.push({
        entityType: e.entityType,
        entityId: e.id,
        title: e.title,
        snippet: hasQuery ? snippet(e.text || e.title, [...phrases, ...tokens]) : snippet(e.text || e.title, []),
        score,
        documentId: e.documentId,
        graphId: e.graphId,
        colour: e.colour,
        updatedAt: e.updatedAt,
      });
    }
    results.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));
    return results.slice(0, limit);
  }
}
