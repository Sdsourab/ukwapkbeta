import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureAnchor } from '@ukw/anchor-engine';
import { DataStore } from './index';

const TEXT = 'Reading research shows that attention drifts during long passages.';
let a: DataStore;
let b: DataStore;
let n = 0;
const fresh = () => new DataStore({ name: `bk-${++n}-${Math.random()}`, broadcast: false }).open();

beforeEach(async () => {
  a = await fresh();
  b = await fresh();
});
afterEach(() => {
  a.close();
  b.close();
});

async function populate(s: DataStore) {
  const doc = await s.documents.upsertFromPage({ url: 'https://example.com/a', title: 'Doc A' });
  const anchor = captureAnchor(TEXT, 8, 16)!;
  const { annotation } = await s.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#8FB8FF', anchor, note: 'note body' });
  const tag = await s.tags.ensure('memory');
  await s.tags.attach(tag.id, 'annotation', annotation.id);
  const col = await s.collections.createCollection({ name: 'Thesis' });
  await s.collections.addItem(col.id, 'document', doc.id);
  const g = await s.graphs.createGraph({ template: 'claim-evidence' });
  await s.settings.set('theme', 'dark');
  const p = await s.projects.createProject({ title: 'Project' });
  await s.references.createReference({ title: 'Ref', projectId: p.id });
  await s.progress.save(doc.id, { scrollRatio: 0.5 });
  return { doc, annotation, tag, col, g, p };
}

describe('export / import', () => {
  it('round-trips everything into an empty store without loss (TC-DATA-01)', async () => {
    const seeded = await populate(a);
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    const summary = await b.importBackup(backup, { mode: 'replace' });
    expect(summary.warnings).toEqual([]);
    expect(await b.stats()).toEqual(await a.stats());
    const ann = await b.annotations.listByDocument(seeded.doc.id);
    expect(ann[0]!.anchor).toEqual(seeded.annotation.anchor);
    expect(ann[0]!.anchor?.exact).toBe(TEXT.slice(8, 16));
    expect(ann[0]!.colour).toBe('#8FB8FF');
    expect((await b.notes.listForAnnotation(seeded.annotation.id))[0]!.body).toBe('note body');
    expect((await b.tags.listForEntity('annotation', seeded.annotation.id)).map((t) => t.name)).toEqual(['memory']);
    expect(await b.settings.get('theme')).toBe('dark');
    const g = await b.graphs.load(seeded.g.id);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toHaveLength(3);
    expect((await b.progress.forDocument(seeded.doc.id))?.scrollRatio).toBe(0.5);
  });

  it('merge adds new records, keeps the newer copy of conflicts and never deletes', async () => {
    const seeded = await populate(a);
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    await b.importBackup(backup, { mode: 'merge' });

    // Edit on B (newer), then merge the OLD backup again: B's edit must survive.
    await new Promise((r) => setTimeout(r, 5));
    await b.annotations.setColour(seeded.annotation.id, '#FF9FC2');
    const s1 = await b.importBackup(backup, { mode: 'merge' });
    expect((await b.annotations.require(seeded.annotation.id)).colour).toBe('#FF9FC2');
    expect(s1.added).toBe(0);

    // Newer record in the backup wins.
    await new Promise((r) => setTimeout(r, 5));
    await a.annotations.setColour(seeded.annotation.id, '#C3A4FF');
    const newer = JSON.parse(JSON.stringify(await a.exportBackup()));
    const s2 = await b.importBackup(newer, { mode: 'merge' });
    expect((await b.annotations.require(seeded.annotation.id)).colour).toBe('#C3A4FF');
    expect(s2.updated).toBeGreaterThan(0);
    // Local-only data is preserved.
    const only = await b.documents.upsertFromPage({ url: 'https://only-on-b.com/x' });
    await b.importBackup(newer, { mode: 'merge' });
    expect(await b.documents.get(only.id)).toBeDefined();
  });

  it('merges tags by name instead of failing on the unique index, remapping tag links', async () => {
    const docA = await a.documents.upsertFromPage({ url: 'https://x.com/1' });
    const tagA = await a.tags.ensure('Memory');
    await a.tags.attach(tagA.id, 'document', docA.id);
    const tagB = await b.tags.ensure('memory'); // same name, different id
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    await b.importBackup(backup, { mode: 'merge' });
    expect(await b.db.tags.count()).toBe(1);
    const tags = await b.tags.listForEntity('document', docA.id);
    expect(tags.map((t) => t.id)).toEqual([tagB.id]);
  });

  it('replace takes a safety backup of the previous data first', async () => {
    const old = await b.documents.upsertFromPage({ url: 'https://old.com/page' });
    await populate(a);
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    const summary = await b.importBackup(backup, { mode: 'replace' });
    expect(await b.documents.get(old.id)).toBeUndefined();
    expect(summary.safetyBackup?.tables.documents?.some((d) => d.id === old.id)).toBe(true);
    // The safety backup itself can be restored.
    await b.importBackup(JSON.parse(JSON.stringify(summary.safetyBackup)), { mode: 'replace' });
    expect(await b.documents.get(old.id)).toBeDefined();
  });

  it('rejects an invalid file without touching existing data (atomic)', async () => {
    const keep = await b.documents.upsertFromPage({ url: 'https://keep.com/x' });
    const good = JSON.parse(JSON.stringify(await (async () => { await populate(a); return a.exportBackup(); })()));
    good.tables.annotations[0].type = 'laser-beam';
    await expect(b.importBackup(good, { mode: 'replace' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await b.documents.get(keep.id)).toBeDefined();
    expect(await b.db.annotations.count()).toBe(0);
    await expect(b.importBackup('not json object')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(b.importBackup({ format: 'ukw-backup', schemaVersion: 99, tables: {} })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps unknown fields from newer minor versions and reports unknown tables', async () => {
    const seeded = await populate(a);
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    backup.tables.documents[0].futureField = { a: 1 };
    backup.tables.newThing = [{ id: 'x' }];
    const summary = await b.importBackup(backup, { mode: 'replace' });
    expect(summary.unknownTables).toEqual(['newThing']);
    expect(((await b.db.documents.get(seeded.doc.id)) as unknown as { futureField: unknown }).futureField).toEqual({ a: 1 });
  });

  it('reports dangling references instead of silently repairing them', async () => {
    const seeded = await populate(a);
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    backup.tables.documents = backup.tables.documents.filter((d: { id: string }) => d.id !== seeded.doc.id);
    const summary = await b.importBackup(backup, { mode: 'replace' });
    expect(summary.warnings.join(' ')).toMatch(/annotation\(s\) belong to a document that is missing/);
    expect(await b.db.annotations.count()).toBe(1); // data kept
  });

  it('can exclude Trash from exports and includes it by default', async () => {
    const doc = await a.documents.upsertFromPage({ url: 'https://trash.com/x' });
    await a.documents.remove(doc.id);
    expect((await a.exportBackup()).tables.documents).toHaveLength(1);
    expect((await a.exportBackup({ includeDeleted: false })).tables.documents).toHaveLength(0);
  });

  it('queues imported records for sync and notifies subscribers', async () => {
    await populate(a);
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    let notified = false;
    b.subscribe((e) => { if (e.op === 'import') notified = true; });
    await b.importBackup(backup, { mode: 'replace' });
    expect(notified).toBe(true);
    expect(await b.pendingSyncCount()).toBeGreaterThan(10);
  });

  it('imports 5,000 annotations in reasonable time (TC-DATA large import)', async () => {
    const doc = await a.documents.upsertFromPage({ url: 'https://big.com/x' });
    const now = '2026-01-01T00:00:00.000Z';
    await a.db.annotations.bulkAdd(Array.from({ length: 5000 }, (_, i) => ({ id: `ann${i}`, createdAt: now, updatedAt: now, schemaVersion: 1, rev: 1, documentId: doc.id, type: 'highlight' as const, status: 'active' as const, isFavorite: false, colour: '#F6D86B', anchor: { exact: `text ${i}` } })));
    const backup = JSON.parse(JSON.stringify(await a.exportBackup()));
    const t0 = performance.now();
    const s = await b.importBackup(backup, { mode: 'replace' });
    expect(s.added).toBe(5001);
    expect(performance.now() - t0).toBeLessThan(15000);
  });
});
