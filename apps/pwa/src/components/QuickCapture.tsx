import { useState } from 'react';
import { Button, Dialog, Field, Segmented, TextArea, TextInput, useToast } from '@ukw/ui';
import { UkwError, normalizeUrl } from '@ukw/domain';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store-context';

type Mode = 'note' | 'link';

/** Zero-friction capture: save a note, or a link with an optional quote, in one step (FR-ZERO). */
export function QuickCapture({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { mode?: Mode; url?: string; title?: string; quote?: string; body?: string } }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'note');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [quote, setQuote] = useState(initial?.quote ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(''); setBody(''); setUrl(''); setQuote(''); setError(''); };

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'note') {
        if (!body.trim() && !title.trim()) { setError('Write something first.'); return; }
        await store.notes.save({ title: title.trim() || undefined, body });
        toast({ message: 'Note saved', kind: 'success' });
        reset(); onClose();
      } else {
        if (!normalizeUrl(url)) { setError('Enter a full web address starting with http:// or https://'); return; }
        const doc = await store.documents.upsertFromPage({ url: url.trim(), title: title.trim() || undefined });
        if (quote.trim()) {
          await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: { exact: quote.trim() }, note: body.trim() || undefined });
        } else if (body.trim()) {
          await store.notes.save({ documentId: doc.id, body });
        }
        toast({ message: 'Saved to your library', kind: 'success' });
        reset(); onClose();
        navigate(`/doc/${doc.id}`);
      }
    } catch (err) {
      setError(err instanceof UkwError ? err.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title="Quick capture" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <Segmented label="Capture type" value={mode} onChange={setMode} options={[{ value: 'note', label: 'Note', icon: 'note' }, { value: 'link', label: 'Link + quote', icon: 'link' }]} />
      {mode === 'link' ? (
        <Field label="Web address" error={error && mode === 'link' ? error : undefined}>
          {(id, d) => <TextInput id={id} aria-describedby={d} inputMode="url" autoComplete="off" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
        </Field>
      ) : null}
      <Field label={mode === 'note' ? 'Title (optional)' : 'Title (optional)'}>
        {(id) => <TextInput id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      {mode === 'link' ? (
        <Field label="Quote (optional)" hint="Saved as a highlight on this source.">
          {(id, d) => <TextArea id={id} aria-describedby={d} value={quote} onChange={(e) => setQuote(e.target.value)} />}
        </Field>
      ) : null}
      <Field label={mode === 'note' ? 'Note' : 'Your note (optional)'} error={error && mode === 'note' ? error : undefined}>
        {(id, d) => <TextArea id={id} aria-describedby={d} value={body} onChange={(e) => setBody(e.target.value)} autoFocus={mode === 'note'} />}
      </Field>
    </Dialog>
  );
}
