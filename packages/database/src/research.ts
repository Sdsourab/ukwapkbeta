import { UkwError, newId, type MatrixColumn, type MatrixRecord, type MatrixRow, type ReferenceRecord, type ResearchItem, type ResearchProjectRecord } from '@ukw/domain';
import type { StoreContext } from './context';
import { EntityRepo, type CreateInput } from './repo';

export class ResearchProjectRepository extends EntityRepo<ResearchProjectRecord> {
  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.researchProjects, 'researchProjects', 'research project');
  }

  async createProject(input: { title: string; description?: string }): Promise<ResearchProjectRecord> {
    const title = input.title.trim();
    if (!title) throw new UkwError('VALIDATION_ERROR', 'A project needs a title.');
    return this.create({ title, description: input.description, status: 'active', questions: [], objectives: [], gaps: [], hypotheses: [], isFavorite: false });
  }

  /** Adds an item to one of the project's tracker lists (questions, objectives, gaps, hypotheses). */
  async addItem(id: string, list: 'questions' | 'objectives' | 'gaps' | 'hypotheses', text: string): Promise<ResearchProjectRecord> {
    const p = await this.require(id);
    const clean = text.trim();
    if (!clean) throw new UkwError('VALIDATION_ERROR', 'Enter some text first.');
    const item: ResearchItem = { id: newId(), text: clean, status: 'open' };
    return this.update(id, { [list]: [...p[list], item] });
  }

  async updateItem(id: string, list: 'questions' | 'objectives' | 'gaps' | 'hypotheses', itemId: string, patch: Partial<Pick<ResearchItem, 'text' | 'status'>>): Promise<ResearchProjectRecord> {
    const p = await this.require(id);
    return this.update(id, { [list]: p[list].map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  }

  async removeItem(id: string, list: 'questions' | 'objectives' | 'gaps' | 'hypotheses', itemId: string): Promise<ResearchProjectRecord> {
    const p = await this.require(id);
    return this.update(id, { [list]: p[list].filter((i) => i.id !== itemId) });
  }

  /** Counts of everything linked to a project, for the overview screen. */
  async summary(id: string): Promise<{ documents: number; references: number; graphs: number; tasks: number; notes: number; matrices: number }> {
    const { db } = this.ctx;
    const live = <T extends { deletedAt?: string | null }>(r: T) => !r.deletedAt;
    const [documents, references, graphs, tasks, notes, matrices] = await Promise.all([
      db.documents.where('projectId').equals(id).filter(live).count(),
      db.references.where('projectId').equals(id).filter(live).count(),
      db.graphs.where('projectId').equals(id).filter(live).count(),
      db.tasks.where('projectId').equals(id).filter(live).count(),
      db.notes.filter((n) => live(n) && n.projectId === id).count(),
      db.matrices.where('projectId').equals(id).filter(live).count(),
    ]);
    return { documents, references, graphs, tasks, notes, matrices };
  }
}

export class ReferenceRepository extends EntityRepo<ReferenceRecord> {
  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.references, 'references', 'reference');
  }

  async createReference(input: Partial<CreateInput<ReferenceRecord>> & { title: string }): Promise<ReferenceRecord> {
    const title = input.title.trim();
    if (!title) throw new UkwError('VALIDATION_ERROR', 'A reference needs a title.');
    if (input.year !== undefined && (input.year < 1000 || input.year > new Date().getFullYear() + 2)) throw new UkwError('VALIDATION_ERROR', 'That publication year does not look right.');
    return this.create({ entryType: 'article', authors: [], keywords: [], readingStatus: 'unread', ...input, title } as CreateInput<ReferenceRecord>);
  }

  async listForProject(projectId: string): Promise<ReferenceRecord[]> {
    const rows = await this.table.where('projectId').equals(projectId).filter((r) => !r.deletedAt).toArray();
    return rows.sort((a, b) => (a.authors[0]?.family ?? a.title).localeCompare(b.authors[0]?.family ?? b.title));
  }

  /** Finds a reference by DOI (case-insensitive) to avoid duplicates. */
  async findByDoi(doi: string): Promise<ReferenceRecord | undefined> {
    const key = doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
    if (!key) return undefined;
    return this.table.filter((r) => !r.deletedAt && (r.doi ?? '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') === key).first();
  }
}

export class MatrixRepository extends EntityRepo<MatrixRecord> {
  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.matrices, 'matrices', 'matrix');
  }

  async createMatrix(input: { title: string; kind: MatrixRecord['kind']; projectId?: string | null; columns?: string[] }): Promise<MatrixRecord> {
    const defaults = input.kind === 'literature' ? ['Method', 'Findings', 'Limitations'] : ['Claim', 'Evidence', 'Strength'];
    const columns: MatrixColumn[] = (input.columns?.length ? input.columns : defaults).map((label) => ({ id: newId(), label }));
    return this.create({ title: input.title.trim() || 'Untitled matrix', kind: input.kind, projectId: input.projectId ?? null, columns, rows: [] });
  }

  async addRow(id: string, row: Partial<Omit<MatrixRow, 'id'>> = {}): Promise<MatrixRecord> {
    const m = await this.require(id);
    return this.update(id, { rows: [...m.rows, { id: newId(), cells: {}, ...row }] });
  }

  async setCell(id: string, rowId: string, columnId: string, value: string): Promise<MatrixRecord> {
    const m = await this.require(id);
    if (!m.columns.some((c) => c.id === columnId)) throw new UkwError('VALIDATION_ERROR', 'Unknown column.');
    return this.update(id, { rows: m.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [columnId]: value } } : r)) });
  }

  async addColumn(id: string, label: string): Promise<MatrixRecord> {
    const m = await this.require(id);
    return this.update(id, { columns: [...m.columns, { id: newId(), label: label.trim() || 'Column' }] });
  }

  async removeRow(id: string, rowId: string): Promise<MatrixRecord> {
    const m = await this.require(id);
    return this.update(id, { rows: m.rows.filter((r) => r.id !== rowId) });
  }

  async removeColumn(id: string, columnId: string): Promise<MatrixRecord> {
    const m = await this.require(id);
    return this.update(id, {
      columns: m.columns.filter((c) => c.id !== columnId),
      rows: m.rows.map((r) => {
        const { [columnId]: _removed, ...cells } = r.cells;
        return { ...r, cells };
      }),
    });
  }
}
