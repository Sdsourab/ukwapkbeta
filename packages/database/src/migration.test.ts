import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { DataStore } from './index';

/** Opens the old (v1) schema directly, writes data, then opens the current app schema over it. */
describe('database migrations (T-006)', () => {
  it('upgrades a v1 database to v2 without losing or altering data', async () => {
    const name = `migrate-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      documents: 'id, normalizedUrl, sourceType, platform, externalId, updatedAt, projectId',
      annotations: 'id, documentId, type, status, updatedAt',
      notes: 'id, documentId, annotationId, updatedAt',
      tags: 'id, &nameKey',
      taggings: 'id, tagId, entityId, [entityType+entityId]',
      collections: 'id, parentId, kind, sortOrder',
      collectionItems: 'id, collectionId, [entityType+entityId]',
      graphs: 'id, projectId, updatedAt',
      nodes: 'id, graphId',
      edges: 'id, graphId, sourceNodeId, targetNodeId',
      researchProjects: 'id, status, updatedAt',
      references: 'id, projectId, documentId, year',
      matrices: 'id, projectId, kind',
      tasks: 'id, projectId, status, dueAt, updatedAt',
      readingProgress: 'id, &documentId',
      syncQueue: '++sequence, &opId, [entityType+recordId], createdAt',
      settings: 'key',
      devices: 'id',
      auditEvents: 'id, entityId, at',
      blobs: 'id, documentId',
    });
    const T = '2026-01-01T00:00:00.000Z';
    await v1.table('documents').add({ id: 'd1', createdAt: T, updatedAt: T, schemaVersion: 1, rev: 3, canonicalUrl: 'https://a.b/x', normalizedUrl: 'https://a.b/x', sourceType: 'web', isFavorite: true, isArchived: false, title: 'Legacy doc' });
    await v1.table('annotations').add({ id: 'a1', createdAt: T, updatedAt: T, schemaVersion: 1, rev: 1, documentId: 'd1', type: 'highlight', status: 'active', isFavorite: false, colour: '#8FB8FF', anchor: { exact: 'legacy quote', startOffset: 4, endOffset: 16 } });
    await v1.table('settings').add({ key: 'theme', value: 'dim', updatedAt: T });
    await v1.table('syncQueue').add({ opId: 'op1', entityType: 'documents', recordId: 'd1', operation: 'upsert', rev: 3, schemaVersion: 1, clientTimestamp: T, createdAt: T, attempts: 0 });
    v1.close();

    const store = await new DataStore({ name, broadcast: false }).open();
    expect(store.db.verno).toBe(2);
    const doc = await store.documents.require('d1');
    expect(doc).toMatchObject({ title: 'Legacy doc', rev: 3, isFavorite: true });
    const ann = await store.annotations.require('a1');
    expect(ann.anchor).toEqual({ exact: 'legacy quote', startOffset: 4, endOffset: 16 });
    expect(await store.settings.get('theme')).toBe('dim');
    expect(await store.pendingSyncCount()).toBe(1); // queued work survives the upgrade
    expect(await store.db.syncMeta.count()).toBe(0);
    // and the upgraded database is fully usable (indexes intact)
    expect(await store.documents.findByNormalizedUrl('https://a.b/x')).toBeDefined();
    expect((await store.search.search({ query: 'legacy' })).length).toBeGreaterThan(0);
    await store.annotations.setColour('a1', '#FF9FC2');
    expect((await store.annotations.require('a1')).rev).toBe(2);
    store.close();

    // re-opening the already-upgraded database is a no-op
    const again = await new DataStore({ name, broadcast: false }).open();
    expect((await again.annotations.require('a1')).colour).toBe('#FF9FC2');
    again.close();
  });

  it('a fresh install starts directly at the current version', async () => {
    const s = await new DataStore({ name: `fresh-${Math.random()}`, broadcast: false }).open();
    expect(s.db.verno).toBe(2);
    s.close();
  });
});
