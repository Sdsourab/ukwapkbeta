import { UkwError, type SyncEntityType } from '@ukw/domain';
import { AnnotationRepository } from './annotations';
import { exportBackup, importBackup, referentialWarnings, type ExportOptions, type ImportMode } from './backup-io';
import { CollectionRepository } from './collections';
import { StoreContext, type ChangeEvent } from './context';
import { UkwDatabase } from './db';
import { DocumentRepository } from './documents';
import { GraphRepository } from './graphs';
import { NoteRepository } from './notes';
import { ReadingProgressRepository } from './progress';
import { MatrixRepository, ReferenceRepository, ResearchProjectRepository } from './research';
import { SearchService } from './search';
import { SettingsRepository } from './settings';
import { TagRepository } from './tags';
import { TaskRepository } from './tasks';

export interface TrashItem {
  entityType: 'documents' | 'annotations' | 'notes' | 'graphs' | 'tasks' | 'references' | 'collections' | 'researchProjects' | 'matrices';
  id: string;
  title: string;
  deletedAt: string;
}

export interface StoreOptions {
  /** IndexedDB database name. */
  name?: string;
  /** Broadcast changes to other tabs/contexts of the same origin. Default true. */
  broadcast?: boolean;
}

/** The single entry point to local data. UI code calls repositories, never IndexedDB directly (docs/08 §8.3). */
export class DataStore {
  readonly db: UkwDatabase;
  readonly ctx: StoreContext;
  readonly documents: DocumentRepository;
  readonly notes: NoteRepository;
  readonly annotations: AnnotationRepository;
  readonly tags: TagRepository;
  readonly collections: CollectionRepository;
  readonly graphs: GraphRepository;
  readonly projects: ResearchProjectRepository;
  readonly references: ReferenceRepository;
  readonly matrices: MatrixRepository;
  readonly tasks: TaskRepository;
  readonly progress: ReadingProgressRepository;
  readonly settings: SettingsRepository;
  readonly search: SearchService;

  constructor(opts: StoreOptions = {}) {
    this.db = new UkwDatabase(opts.name ?? 'ukw');
    this.ctx = new StoreContext(this.db, { broadcast: opts.broadcast });
    this.documents = new DocumentRepository(this.ctx, this.db.documents, 'documents', 'document');
    this.notes = new NoteRepository(this.ctx, this.db.notes, 'notes', 'note');
    this.annotations = new AnnotationRepository(this.ctx, this.notes);
    this.tags = new TagRepository(this.ctx);
    this.collections = new CollectionRepository(this.ctx);
    this.graphs = new GraphRepository(this.ctx);
    this.projects = new ResearchProjectRepository(this.ctx);
    this.references = new ReferenceRepository(this.ctx);
    this.matrices = new MatrixRepository(this.ctx);
    this.tasks = new TaskRepository(this.ctx);
    this.progress = new ReadingProgressRepository(this.ctx);
    this.settings = new SettingsRepository(this.ctx);
    this.search = new SearchService(this.ctx);
  }

  async open(): Promise<this> {
    await this.db.open();
    return this;
  }

  close(): void {
    this.search.dispose();
    this.ctx.close();
    this.db.close();
  }

  subscribe(listener: (e: ChangeEvent) => void): () => void {
    return this.ctx.subscribe(listener);
  }

  /** Groups several repository calls into one undo step. */
  batch<R>(label: string, fn: () => Promise<R>): Promise<R> {
    return this.ctx.batch(label, fn);
  }

  undo = () => this.ctx.undo();
  redo = () => this.ctx.redo();
  canUndo = () => this.ctx.canUndo();
  canRedo = () => this.ctx.canRedo();

  exportBackup(opts?: ExportOptions) {
    return exportBackup(this.ctx, opts);
  }

  importBackup(raw: unknown, opts?: { mode?: ImportMode }) {
    return importBackup(this.ctx, raw, opts);
  }

  integrityWarnings() {
    return referentialWarnings(this.ctx);
  }

  async pendingSyncCount(): Promise<number> {
    return this.db.syncQueue.count();
  }

  /** Queues every live and deleted record for upload (used the first time sync is enabled on existing data). */
  async enqueueAllForSync(): Promise<number> {
    const types = ['documents', 'annotations', 'notes', 'tags', 'taggings', 'collections', 'collectionItems', 'graphs', 'nodes', 'edges', 'researchProjects', 'references', 'matrices', 'tasks', 'readingProgress'] as const;
    let n = 0;
    await this.db.transaction('rw', [...types.map((t) => this.db[t]), this.db.syncQueue], async () => {
      for (const t of types) {
        for (const rec of await (this.db[t] as unknown as { toArray(): Promise<Array<{ id: string; rev: number; deletedAt?: string | null }>> }).toArray()) {
          await this.ctx.enqueue(t, rec.id, rec.deletedAt ? 'delete' : 'upsert', rec.rev);
          n++;
        }
      }
    });
    return n;
  }

  async stats(): Promise<Record<'documents' | 'annotations' | 'notes' | 'graphs' | 'nodes' | 'edges' | 'tags' | 'collections' | 'tasks' | 'references' | 'projects', number>> {
    const live = <T extends { deletedAt?: string | null }>(r: T) => !r.deletedAt;
    const [documents, annotations, notes, graphs, nodes, edges, tags, collections, tasks, references, projects] = await Promise.all([
      this.db.documents.filter(live).count(), this.db.annotations.filter(live).count(), this.db.notes.filter(live).count(),
      this.db.graphs.filter(live).count(), this.db.nodes.filter(live).count(), this.db.edges.filter(live).count(),
      this.db.tags.filter(live).count(), this.db.collections.filter(live).count(), this.db.tasks.filter(live).count(),
      this.db.references.filter(live).count(), this.db.researchProjects.filter(live).count(),
    ]);
    return { documents, annotations, notes, graphs, nodes, edges, tags, collections, tasks, references, projects };
  }

  /* ----------------------------------------------------------------- Trash */

  async listTrash(): Promise<TrashItem[]> {
    const items: TrashItem[] = [];
    const push = (entityType: TrashItem['entityType'], rows: Array<{ id: string; deletedAt?: string | null }>, title: (r: any) => string) => {
      for (const r of rows) if (r.deletedAt) items.push({ entityType, id: r.id, title: title(r) || 'Untitled', deletedAt: r.deletedAt });
    };
    const [docs, anns, notes, graphs, tasks, refs, cols, projs, mats] = await Promise.all([
      this.documents.listDeleted(), this.annotations.listDeleted(), this.notes.listDeleted(), this.graphs.listDeleted(),
      this.tasks.listDeleted(), this.references.listDeleted(), this.collections.listDeleted(), this.projects.listDeleted(), this.matrices.listDeleted(),
    ]);
    // Children deleted together with a parent are restored with it, so list them only when the parent is live.
    const deletedDocIds = new Set(docs.map((d) => d.id));
    const deletedGraphIds = new Set(graphs.map((g) => g.id));
    const deletedAnnIds = new Set(anns.map((a) => a.id));
    push('documents', docs, (d) => d.title || d.canonicalUrl);
    push('annotations', anns.filter((a) => !deletedDocIds.has(a.documentId)), (a) => a.anchor?.exact ?? a.label ?? 'Bookmark');
    push('notes', notes.filter((n) => !(n.documentId && deletedDocIds.has(n.documentId)) && !(n.annotationId && deletedAnnIds.has(n.annotationId))), (n) => n.title || n.body.slice(0, 80));
    push('graphs', graphs, (g) => g.title);
    push('tasks', tasks, (t) => t.title);
    push('references', refs, (r) => r.title);
    push('collections', cols, (c) => c.name);
    push('researchProjects', projs, (p) => p.title);
    push('matrices', mats, (m) => m.title);
    void deletedGraphIds;
    return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  private repoFor(entityType: TrashItem['entityType']) {
    const map = {
      documents: this.documents, annotations: this.annotations, notes: this.notes, graphs: this.graphs, tasks: this.tasks,
      references: this.references, collections: this.collections, researchProjects: this.projects, matrices: this.matrices,
    } as const;
    return map[entityType];
  }

  async restoreFromTrash(entityType: TrashItem['entityType'], id: string): Promise<void> {
    await this.repoFor(entityType).restore(id);
  }

  /** Permanently deletes an item and everything that was deleted with it. Cannot be undone. */
  async purgeFromTrash(entityType: TrashItem['entityType'], id: string): Promise<void> {
    const db = this.db;
    const rec = await (this.repoFor(entityType).table as import('dexie').Table<any, string>).get(id);
    if (!rec) return;
    if (!rec.deletedAt) throw new UkwError('VALIDATION_ERROR', 'Only items in Trash can be permanently deleted.');
    await this.batch('Purge', async () => {
      if (entityType === 'documents') {
        for (const a of await db.annotations.where('documentId').equals(id).toArray()) if (a.deletedAt) await this.annotations.purge(a.id);
        for (const n of await db.notes.where('documentId').equals(id).toArray()) if (n.deletedAt) await this.notes.purge(n.id);
        const rp = await db.readingProgress.where('documentId').equals(id).first();
        if (rp?.deletedAt) await this.progress.purge(rp.id);
      } else if (entityType === 'annotations') {
        for (const n of await db.notes.where('annotationId').equals(id).toArray()) if (n.deletedAt) await this.notes.purge(n.id);
      } else if (entityType === 'graphs') {
        for (const n of await db.nodes.where('graphId').equals(id).toArray()) if (n.deletedAt) await this.graphs.nodes.purge(n.id);
        for (const e of await db.edges.where('graphId').equals(id).toArray()) if (e.deletedAt) await this.graphs.edges.purge(e.id);
      }
      await this.repoFor(entityType).purge(id);
    });
  }

  async emptyTrash(): Promise<number> {
    const items = await this.listTrash();
    for (const i of items) await this.purgeFromTrash(i.entityType, i.id);
    return items.length;
  }
}

export async function openStore(opts: StoreOptions = {}): Promise<DataStore> {
  return new DataStore(opts).open();
}

export type { SyncEntityType };
