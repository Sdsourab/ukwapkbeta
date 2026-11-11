import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '@ukw/database';
import { SupabaseTransport } from './supabase-transport';
import { MemoryTransport, SyncEngine, type PushOp, type PushResult } from './index';

let server: MemoryTransport;
let devices: Array<{ name: string; store: DataStore; engine: SyncEngine }> = [];
let n = 0;

async function device(name: string, transport: MemoryTransport = server) {
  const store = await new DataStore({ name: `sync-${name}-${++n}-${Math.random()}`, broadcast: false }).open();
  const engine = new SyncEngine(store, transport, { pullPageSize: 100 });
  const d = { name, store, engine };
  devices.push(d);
  return d;
}
const tick = (ms = 4) => new Promise((r) => setTimeout(r, ms)); // makes updatedAt strictly ordered across edits

beforeEach(() => { server = new MemoryTransport(); devices = []; });
afterEach(() => { devices.forEach((d) => { d.engine.stopAuto(); d.store.close(); }); });

async function seed(store: DataStore) {
  const doc = await store.documents.upsertFromPage({ url: 'https://example.com/paper', title: 'Paper' });
  const { annotation, note } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#8FB8FF', anchor: { exact: 'attention drifts', prefix: 'that ', suffix: ' over' }, note: 'first thoughts' });
  const tag = await store.tags.ensure('memory');
  await store.tags.attach(tag.id, 'annotation', annotation.id);
  const g = await store.graphs.createGraph({ template: 'claim-evidence' });
  return { doc, annotation, note: note!, tag, g };
}

describe('propagation', () => {
  it('everything A creates arrives on B, and neither side re-queues what it received', async () => {
    const A = await device('A'), B = await device('B');
    const s = await seed(A.store);
    const ra = await A.engine.sync();
    expect(ra.status).toBe('idle');
    expect(ra.pushed).toBeGreaterThan(10);
    expect(await A.store.pendingSyncCount()).toBe(0);

    const rb = await B.engine.sync();
    expect(rb.pulled).toBeGreaterThan(10);
    expect(await B.store.pendingSyncCount()).toBe(0); // no echo loop
    expect((await B.store.annotations.require(s.annotation.id)).anchor?.exact).toBe('attention drifts');
    expect((await B.store.notes.require(s.note.id)).body).toBe('first thoughts');
    expect((await B.store.tags.listForEntity('annotation', s.annotation.id)).map((t) => t.name)).toEqual(['memory']);
    const g = await B.store.graphs.load(s.g.id);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toHaveLength(3);
    expect((await B.store.search.search({ query: 'first thoughts' })).length).toBeGreaterThan(0); // index follows remote changes
    expect(await B.engine.lastSyncAt()).not.toBeNull();
  });

  it('a second sync with nothing new does no work', async () => {
    const A = await device('A');
    await seed(A.store);
    await A.engine.sync();
    const before = server.calls.push;
    const r = await A.engine.sync();
    expect(r.pushed).toBe(0);
    expect(r.pulled).toBe(0);
    expect(server.calls.push).toBe(before); // empty queue: no push request at all
  });

  it('syncs existing local data the first time sync is enabled', async () => {
    const A = await device('A');
    const s = await seed(A.store);
    await A.engine.sync();
    await A.store.db.syncQueue.clear(); // simulate data created before sync existed
    const queued = await A.store.enqueueAllForSync();
    expect(queued).toBeGreaterThan(10);
    const fresh = await device('C');
    await A.engine.sync();
    await fresh.engine.sync();
    expect(await fresh.store.annotations.get(s.annotation.id)).toBeDefined();
  });

  it('pulls large histories across pages', async () => {
    const A = await device('A'), B = await device('B');
    const doc = await A.store.documents.upsertFromPage({ url: 'https://big.example/x' });
    const now = '2026-01-01T00:00:00.000Z';
    await A.store.db.annotations.bulkAdd(Array.from({ length: 450 }, (_, i) => ({ id: `a${i}`, createdAt: now, updatedAt: now, schemaVersion: 1, rev: 1, documentId: doc.id, type: 'highlight' as const, status: 'active' as const, isFavorite: false, anchor: { exact: `q${i}` } })));
    await A.store.enqueueAllForSync();
    await A.engine.sync();
    const r = await B.engine.sync();
    expect(r.pulled).toBe(451);
    expect(await B.store.db.annotations.count()).toBe(450);
    expect(server.calls.pull).toBeGreaterThanOrEqual(5);
  });

  it('device-only settings are never uploaded', async () => {
    const A = await device('A');
    await A.store.settings.set('theme', 'dim');
    expect(await A.store.pendingSyncCount()).toBe(1);
    const r = await A.engine.sync();
    expect(r.pushed).toBe(0);
    expect(server.snapshot()).toHaveLength(0);
    expect(await A.store.pendingSyncCount()).toBe(0);
  });
});

describe('offline queue and retries', () => {
  it('keeps work queued while offline and delivers it when the connection returns (TC-SYNC-02)', async () => {
    const A = await device('A'), B = await device('B');
    const s = await seed(A.store);
    server.failNext = 1;
    const offline = await A.engine.sync();
    expect(offline.status).toBe('offline');
    expect(A.engine.status).toBe('offline');
    const queued = await A.store.pendingSyncCount();
    expect(queued).toBeGreaterThan(10);
    expect((await A.store.db.syncQueue.toArray())[0]!.attempts).toBe(1);
    expect(await A.store.annotations.get(s.annotation.id)).toBeDefined(); // local data unaffected

    const online = await A.engine.sync();
    expect(online.status).toBe('idle');
    expect(await A.store.pendingSyncCount()).toBe(0);
    await B.engine.sync();
    expect(await B.store.annotations.get(s.annotation.id)).toBeDefined();
  });

  it('a lost response is retried safely: the same opId does not write twice (idempotency)', async () => {
    const A = await device('A');
    const s = await seed(A.store);
    let dropped = false;
    const flaky = {
      push: async (ops: PushOp[]): Promise<PushResult[]> => { const r = await server.push(ops); if (!dropped) { dropped = true; throw Object.assign(new Error('response lost'), { code: 'OFFLINE' }); } return r; },
      pull: (a: number, b: number) => server.pull(a, b),
    };
    const store = A.store;
    const engine = new SyncEngine(store, flaky);
    const first = await engine.sync();
    expect(first.status).toBe('offline');
    const seqAfterFirst = server.lastSeq;
    expect(seqAfterFirst).toBeGreaterThan(0); // the server did apply them
    const second = await engine.sync();
    expect(second.status).toBe('idle');
    expect(server.lastSeq).toBe(seqAfterFirst); // replay returned the cached results; nothing re-applied
    expect(await store.pendingSyncCount()).toBe(0);
    void s;
  });

  it('a rejected operation stays queued with its error and does not block the rest', async () => {
    const A = await device('A');
    await A.store.documents.upsertFromPage({ url: 'https://ok.example/a' });
    const reject = {
      push: async (ops: PushOp[]): Promise<PushResult[]> => ops.map((o, i) => (i === 0 ? { opId: o.opId, status: 'rejected' as const, error: 'payload too large' } : { opId: o.opId, status: 'ok' as const, record: { entityType: o.entityType, id: o.id, rev: o.rev, updatedAt: o.updatedAt, deleted: o.deleted, payload: o.payload, serverSeq: i + 1 } })),
      pull: async (since: number) => ({ records: [], nextSeq: since, hasMore: false }),
    };
    await A.store.notes.save({ body: 'second record' });
    const r = await new SyncEngine(A.store, reject).sync();
    expect(r.status).toBe('error');
    expect(r.errors[0]).toMatch(/payload too large/);
    const left = await A.store.db.syncQueue.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]!.lastError).toBe('payload too large');
    expect(left[0]!.attempts).toBe(1);
  });

  it('concurrent sync() calls share a single run', async () => {
    const A = await device('A');
    await seed(A.store);
    const [a, b] = await Promise.all([A.engine.sync(), A.engine.sync()]);
    expect(a).toBe(b);
    expect(server.calls.push).toBeLessThanOrEqual(3);
  });

  it('reports status transitions to subscribers', async () => {
    const A = await device('A');
    await seed(A.store);
    const seen: string[] = [];
    A.engine.subscribe((s) => seen.push(s));
    await A.engine.sync();
    expect(seen).toEqual(['syncing', 'idle']);
  });
});

describe('conflicts (TC-SYNC-03)', () => {
  it('concurrent edits to the same annotation: last writer wins and both devices converge', async () => {
    const A = await device('A'), B = await device('B');
    const s = await seed(A.store);
    await A.engine.sync(); await B.engine.sync();

    await A.store.annotations.setColour(s.annotation.id, '#FF9FC2');
    await tick();
    await B.store.annotations.setColour(s.annotation.id, '#C3A4FF'); // later edit
    await A.engine.sync();
    const rb = await B.engine.sync(); // B conflicts with A's already-synced edit, wins, re-pushes
    expect(rb.conflicts.localWon).toBe(1);
    await A.engine.sync();
    expect((await A.store.annotations.require(s.annotation.id)).colour).toBe('#C3A4FF');
    expect((await B.store.annotations.require(s.annotation.id)).colour).toBe('#C3A4FF');
    expect(await A.store.pendingSyncCount()).toBe(0);
    expect(await B.store.pendingSyncCount()).toBe(0);
  });

  it('the older offline edit loses gracefully when it syncs second', async () => {
    const A = await device('A'), B = await device('B');
    const s = await seed(A.store);
    await A.engine.sync(); await B.engine.sync();
    await B.store.annotations.setColour(s.annotation.id, '#C3A4FF'); // earlier
    await tick();
    await A.store.annotations.setColour(s.annotation.id, '#FF9FC2'); // later
    await A.engine.sync();
    const rb = await B.engine.sync();
    expect(rb.conflicts.serverWon).toBe(1);
    expect((await B.store.annotations.require(s.annotation.id)).colour).toBe('#FF9FC2');
    expect(await B.store.pendingSyncCount()).toBe(0);
  });

  it('concurrent note edits keep BOTH texts: the server version plus a conflict copy', async () => {
    const A = await device('A'), B = await device('B');
    const s = await seed(A.store);
    await A.engine.sync(); await B.engine.sync();

    await A.store.notes.save({ id: s.note.id, body: 'A wrote this on the train' });
    await tick();
    await B.store.notes.save({ id: s.note.id, body: 'B wrote this at the desk' });
    await A.engine.sync();
    const rb = await B.engine.sync();
    expect(rb.conflicts.noteCopies).toBe(1);
    await A.engine.sync(); await B.engine.sync();

    for (const d of [A, B]) {
      const notes = await d.store.notes.list();
      expect(notes).toHaveLength(2);
      expect(notes.find((x) => x.id === s.note.id)!.body).toBe('A wrote this on the train');
      const copy = notes.find((x) => x.conflictOf === s.note.id)!;
      expect(copy.body).toBe('B wrote this at the desk');
      expect(copy.title).toMatch(/conflict copy/);
      expect(copy.annotationId).toBe(s.annotation.id); // stays attached to the same highlight
    }
  });

  it('delete and restore propagate; the later action wins', async () => {
    const A = await device('A'), B = await device('B');
    const s = await seed(A.store);
    await A.engine.sync(); await B.engine.sync();
    await A.store.annotations.remove(s.annotation.id);
    await A.engine.sync(); await B.engine.sync();
    expect(await B.store.annotations.get(s.annotation.id)).toBeUndefined();
    expect((await B.store.notes.listForAnnotation(s.annotation.id))).toHaveLength(0); // cascade arrived too
    await tick();
    await B.store.annotations.restore(s.annotation.id);
    await B.engine.sync(); await A.engine.sync();
    expect(await A.store.annotations.get(s.annotation.id)).toBeDefined();
    expect(await A.store.notes.listForAnnotation(s.annotation.id)).toHaveLength(1);
  });

  it('deleting on one device while editing on another resolves to whichever happened last', async () => {
    const A = await device('A'), B = await device('B');
    const s = await seed(A.store);
    await A.engine.sync(); await B.engine.sync();
    await A.store.annotations.remove(s.annotation.id);
    await tick();
    await B.store.annotations.setColour(s.annotation.id, '#C3A4FF'); // edit is later than the delete
    await A.engine.sync(); await B.engine.sync(); await A.engine.sync();
    expect(await A.store.annotations.get(s.annotation.id)).toBeDefined();
    expect((await A.store.annotations.require(s.annotation.id)).colour).toBe('#C3A4FF');
  });
});

describe('identity convergence', () => {
  it('the same tag created independently on two devices becomes one tag with one link', async () => {
    const A = await device('A'), B = await device('B');
    const docA = await A.store.documents.upsertFromPage({ url: 'https://same.example/p', title: 'P' });
    const tagA = await A.store.tags.ensure('Memory');
    await A.store.tags.attach(tagA.id, 'document', docA.id);
    await A.engine.sync();
    await B.engine.sync();
    const tagB = await B.store.tags.ensure('memory'); // different case, created independently
    await B.store.tags.attach(tagB.id, 'document', docA.id);
    await B.engine.sync(); await A.engine.sync();
    for (const d of [A, B]) {
      expect(await d.store.tags.list()).toHaveLength(1);
      expect((await d.store.tags.listForEntity('document', docA.id)).map((t) => t.name)).toEqual(['Memory']);
      expect(await d.store.db.taggings.count()).toBe(1);
    }
  });

  it('a legacy random-id tag on one device merges into the server tag without losing its links', async () => {
    const A = await device('A'), B = await device('B');
    const doc = await B.store.documents.upsertFromPage({ url: 'https://legacy.example/p' });
    const T = '2026-01-01T00:00:00.000Z';
    await B.store.db.tags.add({ id: 'legacy-uuid-1', createdAt: T, updatedAt: T, schemaVersion: 1, rev: 1, name: 'memory', nameKey: 'memory' });
    await B.store.db.taggings.add({ id: 'legacy-link', createdAt: T, updatedAt: T, schemaVersion: 1, rev: 1, tagId: 'legacy-uuid-1', entityType: 'document', entityId: doc.id });
    await A.store.tags.ensure('memory');
    await A.engine.sync();
    await B.engine.sync(); // pulls tag:memory, which collides with the legacy row on the unique name index
    const live = await B.store.tags.list();
    expect(live.map((t) => t.id)).toEqual(['tag:memory']);
    expect((await B.store.tags.listForEntity('document', doc.id)).map((t) => t.id)).toEqual(['tag:memory']);
  });
});

describe('safety', () => {
  it('records written by a newer app version are skipped, reported, and re-fetched after an upgrade', async () => {
    const A = await device('A');
    await server.push([{ opId: 'x', entityType: 'notes', id: 'future-note', rev: 1, updatedAt: '2026-01-01T00:00:00.000Z', deleted: false, baseSeq: 0, deviceId: 'future', payload: { id: 'future-note', schemaVersion: 99, body: 'from the future' } }]);
    await server.push([{ opId: 'y', entityType: 'notes', id: 'normal', rev: 1, updatedAt: '2026-01-01T00:00:00.000Z', deleted: false, baseSeq: 0, deviceId: 'other', payload: { id: 'normal', schemaVersion: 1, body: 'readable', format: 'markdown', createdAt: 'x', updatedAt: '2026-01-01T00:00:00.000Z', rev: 1, pinned: false, isFavorite: false, isArchived: false } }]);
    const r = await A.engine.sync();
    expect(r.skippedNewerSchema).toBe(1);
    expect(await A.store.db.notes.get('future-note')).toBeUndefined();
    expect(await A.store.db.syncMeta.get('cursor').then((x) => x?.value as number)).toBeLessThan(1); // cursor held back
  });

  it('applying remote data never creates undo history or audit noise', async () => {
    const A = await device('A'), B = await device('B');
    await seed(A.store);
    await A.engine.sync();
    await B.engine.sync();
    expect(B.store.canUndo()).toBe(false);
    expect(await B.store.db.auditEvents.count()).toBe(0);
  });
});

describe('randomised multi-device convergence', () => {
  /** Tiny seeded PRNG so a failing run is reproducible. */
  const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

  for (const seed of [1, 7, 42]) {
    it(`three devices, 70 random operations, flaky network, seed ${seed}: all converge to identical data`, async () => {
      const r = rng(seed);
      const devs = [await device('A'), await device('B'), await device('C')];
      const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
      const colours = ['#F6D86B', '#8FB8FF', '#FF9FC2', '#C3A4FF'];
      const base = await devs[0]!.store.documents.upsertFromPage({ url: 'https://fuzz.example/doc', title: 'Fuzz' });
      await devs[0]!.engine.sync();
      for (const d of devs.slice(1)) await d.engine.sync();

      for (let step = 0; step < 70; step++) {
        const d = pick(devs);
        const anns = await d.store.annotations.list();
        const notes = await d.store.notes.list();
        const roll = r();
        try {
          if (roll < 0.25 || anns.length === 0) await d.store.annotations.createAnnotation({ documentId: base.id, type: 'highlight', colour: pick(colours), anchor: { exact: `quote ${step}` }, note: r() < 0.5 ? `note ${step}` : undefined });
          else if (roll < 0.45) await d.store.annotations.setColour(pick(anns).id, pick(colours));
          else if (roll < 0.55) await d.store.annotations.remove(pick(anns).id);
          else if (roll < 0.65) { const dead = await d.store.annotations.listDeleted(); if (dead.length) await d.store.annotations.restore(pick(dead).id); }
          else if (roll < 0.8 && notes.length) await d.store.notes.save({ id: pick(notes).id, body: `edit ${step} by ${d.name}` });
          else if (roll < 0.9) { const t = await d.store.tags.ensure(pick(['alpha', 'beta', 'Gamma'])); await d.store.tags.attach(t.id, 'annotation', pick(anns).id); }
          else await d.store.notes.save({ documentId: base.id, body: `page note ${step} ${d.name}` });
        } catch { /* a precondition changed under us (e.g. already deleted): fine */ }
        await tick(2);
        if (r() < 0.4) { if (r() < 0.25) server.failNext = 1; await pick(devs).engine.sync(); }
      }
      server.failNext = 0;
      for (let round = 0; round < 3; round++) for (const d of devs) await d.engine.sync();

      const dump = async (s: DataStore) => {
        const rows = async (t: 'documents' | 'annotations' | 'notes' | 'tags' | 'taggings') => (await (s.db[t] as unknown as { toArray(): Promise<any[]> }).toArray()).sort((a, b) => a.id.localeCompare(b.id)).map((x) => JSON.stringify(x, Object.keys(x).sort()));
        return { documents: await rows('documents'), annotations: await rows('annotations'), notes: await rows('notes'), tags: await rows('tags'), taggings: await rows('taggings') };
      };
      const [d0, d1, d2] = await Promise.all(devs.map((d) => dump(d.store)));
      expect(d1).toEqual(d0);
      expect(d2).toEqual(d0);
      for (const d of devs) expect(await d.store.pendingSyncCount()).toBe(0);
      expect(d0!.annotations.length).toBeGreaterThan(3); // the run did real work
    }, 60_000);
  }
});

describe('SupabaseTransport request/response mapping (unit; not run against a live server)', () => {
  const cfg = (fetchImpl: typeof fetch) => ({ url: 'https://abc.supabase.co/', anonKey: 'anon-key', getAccessToken: () => 'user-jwt', fetch: fetchImpl });
  const res = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const op: PushOp = { opId: 'o1', entityType: 'notes', id: 'n1', rev: 2, updatedAt: '2026-01-01T00:00:00.000Z', deleted: false, payload: { id: 'n1' }, baseSeq: 3, deviceId: 'dev' };

  it('calls the RPC endpoints with the anon key and the USER token (never a service key) and maps rows', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
    const t = new SupabaseTransport(cfg((async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
      return url.endsWith('ukw_push')
        ? res(200, [{ op_id: 'o1', status: 'ok', record: { entity_type: 'notes', id: 'n1', rev: 2, updated_at: '2026-01-01T00:00:00.000Z', deleted: false, payload: { id: 'n1' }, server_seq: '9', device_id: 'dev' } }])
        : res(200, [1, 2, 3].map((i) => ({ entity_type: 'notes', id: `n${i}`, rev: 1, updated_at: 'x', deleted: false, payload: {}, server_seq: i })));
    }) as unknown as typeof fetch));
    const pushed = await t.push([op]);
    expect(calls[0]!.url).toBe('https://abc.supabase.co/rest/v1/rpc/ukw_push');
    expect(calls[0]!.headers).toMatchObject({ apikey: 'anon-key', authorization: 'Bearer user-jwt' });
    expect(calls[0]!.body.ops[0]).toMatchObject({ op_id: 'o1', entity_type: 'notes', base_seq: 3, device_id: 'dev' });
    expect(pushed[0]).toMatchObject({ opId: 'o1', status: 'ok', record: { serverSeq: 9, entityType: 'notes' } });
    const page = await t.pull(0, 2);
    expect(calls[1]!.body).toEqual({ since: 0, lim: 3 });
    expect(page.records).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextSeq).toBe(2);
  });

  it('maps HTTP and network failures to typed errors the engine understands', async () => {
    const mk = (f: () => Promise<Response>) => new SupabaseTransport(cfg(f as unknown as typeof fetch));
    await expect(mk(async () => res(401)).pull(0, 1)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(mk(async () => res(429)).pull(0, 1)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    await expect(mk(async () => res(503)).pull(0, 1)).rejects.toMatchObject({ code: 'OFFLINE' });
    await expect(mk(async () => { throw new TypeError('Failed to fetch'); }).pull(0, 1)).rejects.toMatchObject({ code: 'OFFLINE' });
    await expect(mk(async () => res(400)).pull(0, 1)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('the engine treats a transport OFFLINE error as offline and keeps the queue', async () => {
    const A = await device('A');
    await A.store.notes.save({ body: 'keep me' });
    const t = new SupabaseTransport(cfg((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch));
    const r = await new SyncEngine(A.store, t).sync();
    expect(r.status).toBe('offline');
    expect(await A.store.pendingSyncCount()).toBe(1);
  });
});

void vi;
