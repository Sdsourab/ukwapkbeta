import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, EmptyState, Field, Icon, IconButton, Kbd, Segmented, Switch, TextInput, THEME_LABELS, useToast } from '@ukw/ui';
import { THEME_MODES, DEFAULT_SETTINGS, UkwError, type ThemeMode } from '@ukw/domain';
import type { ImportSummary, TrashItem } from '@ukw/database';
import { dateStamp, downloadBlob, readFileText } from '../lib/download';
import { plural, timeAgo } from '../lib/format';
import { useSettings, useStore, useStoreQuery } from '../store-context';

const ACCENTS = ['#3a49c9', '#0f766e', '#b4235a', '#9a5b00', '#6d3fc0'];
const THEME_ICON = { light: 'sun', dark: 'moon', system: 'smartphone', dim: 'moon', 'high-contrast': 'eye' } as const;

function Appearance() {
  const store = useStore();
  const s = useSettings();
  const set = <K extends keyof typeof DEFAULT_SETTINGS>(k: K, v: (typeof DEFAULT_SETTINGS)[K]) => void store.settings.set(k, v);
  const [accentDraft, setAccentDraft] = useState(s.accent);
  useEffect(() => setAccentDraft(s.accent), [s.accent]);
  return (
    <section className="card section" aria-labelledby="ap-h">
      <h2 id="ap-h">Appearance</h2>
      <Segmented<ThemeMode> label="Theme" value={s.theme} onChange={(v) => set('theme', v)} options={THEME_MODES.map((m) => ({ value: m, label: THEME_LABELS[m], icon: THEME_ICON[m] }))} />
      <p className="muted">“System” follows your device. “Dim” is a softer dark. “High contrast” maximises legibility.</p>
      <Field label="Accent colour" hint={s.theme === 'high-contrast' ? 'High contrast mode uses its own accent for legibility.' : undefined}>
        {(id) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} id={id}>
            {ACCENTS.map((c) => <button key={c} type="button" aria-label={`Accent ${c}`} className={`swatch${s.accent.toLowerCase() === c ? ' is-selected' : ''}`} style={{ background: c }} onClick={() => set('accent', c)} />)}
            <TextInput aria-label="Custom accent hex" style={{ width: 110 }} value={accentDraft} maxLength={7} onChange={(e) => setAccentDraft(e.target.value)} onBlur={() => { if (/^#[0-9a-fA-F]{6}$/.test(accentDraft)) set('accent', accentDraft); else setAccentDraft(s.accent); }} />
          </div>
        )}
      </Field>
      <Field label={`Text size (${Math.round(s.fontScale * 100)}%)`}>{(id) => <input id={id} type="range" min={0.85} max={1.4} step={0.05} value={s.fontScale} onChange={(e) => set('fontScale', Number(e.target.value))} />}</Field>
      <Switch label="Reduce motion" hint="Turns off animations and transitions." checked={s.reducedMotion} onChange={(v) => set('reducedMotion', v)} />
    </section>
  );
}

function Palette() {
  const store = useStore();
  const s = useSettings();
  const rename = (id: string, label: string) => store.settings.set('palette', s.palette.map((c) => (c.id === id ? { ...c, label: label.slice(0, 30) || c.label } : c)));
  return (
    <section className="card section" aria-labelledby="pal-h">
      <h2 id="pal-h">Highlight colours</h2>
      <p className="muted">Give each colour a meaning (for example, “Evidence” or “Disagree”). Labels are used in filters and exports.</p>
      <div className="rows">
        {s.palette.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className={`swatch${s.defaultColour.toLowerCase() === c.hex.toLowerCase() ? ' is-selected' : ''}`} style={{ background: c.hex }} aria-label={`Use ${c.label} as the default colour`} title="Set as default" onClick={() => void store.settings.set('defaultColour', c.hex)} />
            <TextInput aria-label={`Label for ${c.hex}`} defaultValue={c.label} maxLength={30} onBlur={(e) => { if (e.target.value !== c.label) void rename(c.id, e.target.value); }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function DataSection() {
  const store = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const stats = useStoreQuery((s) => s.stats(), []);
  const [pendingFile, setPendingFile] = useState<{ name: string; json: unknown } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [summary, setSummary] = useState<(ImportSummary & { problems?: string[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const exportAll = async () => {
    const b = await store.exportBackup();
    downloadBlob(JSON.stringify(b, null, 2), `ukw-backup-${dateStamp()}.json`, 'application/json');
    toast({ message: 'Backup downloaded', kind: 'success' });
  };
  const pick = async (file?: File) => {
    if (!file) return;
    try { setPendingFile({ name: file.name, json: JSON.parse(await readFileText(file)) }); setMode('merge'); }
    catch (err) { toast({ message: err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Could not read the file', kind: 'error' }); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const runImport = async () => {
    if (!pendingFile) return;
    setBusy(true);
    try { const r = await store.importBackup(pendingFile.json, { mode }); setPendingFile(null); setSummary(r); }
    catch (err) {
      const issues = err instanceof UkwError && Array.isArray(err.details) ? (err.details as Array<{ table?: string; index?: number; message: string }>).slice(0, 5).map((i) => `${i.table ?? ''}${i.index !== undefined ? ` #${i.index + 1}` : ''}: ${i.message}`) : [];
      setPendingFile(null);
      setSummary({ mode, added: 0, updated: 0, skipped: 0, byTable: {}, unknownTables: [], warnings: [], problems: [err instanceof Error ? err.message : 'Import failed', ...issues] });
    } finally { setBusy(false); }
  };
  const wipeAll = async () => {
    const backup = await store.exportBackup();
    downloadBlob(JSON.stringify(backup, null, 2), `ukw-backup-before-delete-${dateStamp()}.json`, 'application/json');
    await store.importBackup({ format: 'ukw-backup', schemaVersion: 1, appVersion: '0.1.0', exportedAt: new Date().toISOString(), tables: {} }, { mode: 'replace' });
    setWipe(false); setConfirmText('');
    toast({ message: 'All local data deleted. A backup was downloaded first.', kind: 'info', duration: 9000 });
  };

  return (
    <section className="card section" aria-labelledby="data-h">
      <h2 id="data-h">Your data</h2>
      {stats.data ? <div className="kv">{(['documents', 'annotations', 'notes', 'graphs', 'tags', 'collections'] as const).map((k) => <div key={k}><b>{stats.data![k]}</b>{k}</div>)}</div> : null}
      <p className="muted">Everything lives in this browser on this device. Export a backup regularly; importing never deletes anything unless you choose “Replace”.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon="download" onClick={() => void exportAll()}>Export backup (JSON)</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <Button icon="upload" onClick={() => fileRef.current?.click()}>Import backup…</Button>
        <Button variant="danger" icon="trash" onClick={() => setWipe(true)}>Delete all data…</Button>
      </div>

      <Dialog open={!!pendingFile} title="Import backup" onClose={() => setPendingFile(null)} footer={<><Button variant="ghost" onClick={() => setPendingFile(null)}>Cancel</Button><Button variant={mode === 'replace' ? 'danger' : 'primary'} loading={busy} onClick={() => void runImport()}>{mode === 'replace' ? 'Replace my data' : 'Merge'}</Button></>}>
        <p><strong>{pendingFile?.name}</strong></p>
        <Segmented label="Import mode" value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Merge (safe)' }, { value: 'replace', label: 'Replace' }]} />
        <p className="muted">{mode === 'merge' ? 'Adds anything new and keeps whichever copy of a record is newer. Nothing is deleted.' : 'Removes everything here first and uses the file instead. A safety backup of your current data is offered for download afterwards.'}</p>
      </Dialog>

      <Dialog open={!!summary} title={summary?.problems ? 'Import failed' : 'Import complete'} onClose={() => setSummary(null)}
        footer={<>{summary?.safetyBackup ? <Button icon="download" onClick={() => downloadBlob(JSON.stringify(summary.safetyBackup, null, 2), `ukw-previous-data-${dateStamp()}.json`, 'application/json')}>Download previous data</Button> : null}<Button variant="primary" onClick={() => setSummary(null)}>Done</Button></>}>
        {summary?.problems ? (
          <><p>Nothing was changed.</p><ul>{summary.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></>
        ) : summary ? (
          <>
            <div className="kv"><div><b>{summary.added}</b>added</div><div><b>{summary.updated}</b>updated</div><div><b>{summary.skipped}</b>unchanged</div></div>
            {summary.unknownTables.length ? <p className="muted">Ignored unknown tables from a newer version: {summary.unknownTables.join(', ')}.</p> : null}
            {summary.warnings.length ? <div role="alert"><strong>Needs attention</strong><ul>{summary.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div> : null}
          </>
        ) : null}
      </Dialog>

      <Dialog open={wipe} title="Delete all local data?" onClose={() => setWipe(false)} footer={<><Button variant="ghost" onClick={() => setWipe(false)}>Cancel</Button><Button variant="danger" disabled={confirmText !== 'DELETE'} onClick={() => void wipeAll()}>Delete everything</Button></>}>
        <p>This removes every source, highlight, note and graph from this browser. A backup file downloads first so you can restore it.</p>
        <Field label="Type DELETE to confirm">{(id) => <TextInput id={id} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}</Field>
      </Dialog>
    </section>
  );
}

function TrashSection() {
  const store = useStore();
  const toast = useToast();
  const trash = useStoreQuery((s) => s.listTrash(), []);
  const [confirm, setConfirm] = useState<TrashItem | 'all' | null>(null);
  const items = trash.data ?? [];
  const purge = async () => {
    if (!confirm) return;
    try {
      if (confirm === 'all') { const n = await store.emptyTrash(); toast({ message: `Permanently deleted ${plural(n, 'item')}` }); }
      else { await store.purgeFromTrash(confirm.entityType, confirm.id); toast({ message: 'Permanently deleted' }); }
    } catch (err) {
      // e.g. the item was restored in another tab since this list was drawn
      toast({ message: err instanceof UkwError ? err.message : 'Could not delete that item.', kind: 'error' });
    } finally {
      setConfirm(null);
      trash.reload();
    }
  };
  const restore = async (t: TrashItem) => {
    try { await store.restoreFromTrash(t.entityType, t.id); toast({ message: 'Restored', kind: 'success' }); }
    catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Could not restore that item.', kind: 'error' }); }
    finally { trash.reload(); }
  };
  return (
    <section className="card section" aria-labelledby="trash-h">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><h2 id="trash-h">Trash</h2>{items.length ? <Button size="sm" variant="danger" onClick={() => setConfirm('all')}>Empty trash</Button> : null}</div>
      {items.length === 0 ? <EmptyState icon="trash" title="Trash is empty">Deleted items wait here until you remove them for good.</EmptyState> : (
        <div className="rows">
          {items.map((t) => (
            <div key={`${t.entityType}-${t.id}`} className="card doclink" style={{ padding: '6px 8px 6px 14px' }}>
              <div style={{ minWidth: 0 }}><div className="row__title">{t.title}</div><div className="row__meta"><span className="badge">{t.entityType}</span><span>deleted {timeAgo(t.deletedAt)}</span></div></div>
              <span style={{ display: 'flex' }}>
                <Button size="sm" onClick={() => void restore(t)}>Restore</Button>
                <IconButton size="sm" icon="trash" label={`Delete ${t.title} permanently`} onClick={() => setConfirm(t)} />
              </span>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!confirm} title="Delete permanently?" onClose={() => setConfirm(null)} footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={() => void purge()}>Delete forever</Button></>}>
        <p>{confirm === 'all' ? 'Everything in Trash will be removed and cannot be recovered.' : 'This item and anything deleted with it cannot be recovered.'}</p>
      </Dialog>
    </section>
  );
}

function SyncAndStorage() {
  const store = useStore();
  const toast = useToast();
  const pending = useStoreQuery((s) => s.pendingSyncCount(), []);
  const [est, setEst] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  useEffect(() => {
    void (async () => {
      const e = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setEst({ usage: e?.usage, quota: e?.quota, persisted });
    })();
  }, []);
  const mb = (n?: number) => (n === undefined ? '—' : `${(n / 1048576).toFixed(1)} MB`);
  void store;
  return (
    <section className="card section" aria-labelledby="sync-h">
      <h2 id="sync-h">Sync & storage</h2>
      <div className="kv"><div><b>{pending.data ?? 0}</b>changes queued</div><div><b>{mb(est.usage)}</b>used</div><div><b>{est.persisted ? 'Yes' : 'No'}</b>protected storage</div></div>
      <p className="muted"><Icon name="cloud" size={14} /> Cloud sync is <strong>not configured</strong> in this build. Changes are queued locally and nothing leaves your device. See the deployment guide to connect your own Supabase project.</p>
      {est.persisted === false && navigator.storage?.persist ? (
        <div><Button onClick={async () => { const ok = await navigator.storage.persist(); setEst((e) => ({ ...e, persisted: ok })); toast({ message: ok ? 'Storage protected from automatic clean-up' : 'The browser declined. Installing the app often helps.', kind: ok ? 'success' : 'info' }); }}>Protect my data from clean-up</Button></div>
      ) : null}
    </section>
  );
}

export function SettingsScreen() {
  return (
    <div className="settings">
      <div className="pagehead"><div><h1>Settings</h1><p>Appearance, highlight colours, backup and storage.</p></div></div>
      <Appearance />
      <Palette />
      <DataSection />
      <TrashSection />
      <SyncAndStorage />
      <section className="card section" aria-labelledby="keys-h">
        <h2 id="keys-h">Keyboard shortcuts</h2>
        <div className="shortcuts">
          <span><Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>K</Kbd></span><span>Command palette</span>
          <span><Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>Z</Kbd></span><span>Undo</span>
          <span><Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>Shift</Kbd> + <Kbd>Z</Kbd></span><span>Redo</span>
          <span><Kbd>/</Kbd></span><span>Open search</span>
        </div>
        <p className="muted">Browser-extension shortcuts are listed on the extension’s options page.</p>
      </section>
    </div>
  );
}
