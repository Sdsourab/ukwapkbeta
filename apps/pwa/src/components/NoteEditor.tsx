import { useEffect, useRef, useState } from 'react';
import { TextArea, useDebouncedCallback, useToast } from '@ukw/ui';
import type { NoteRecord } from '@ukw/domain';
import { useStore } from '../store-context';

/**
 * Autosaving note editor (FR-ZERO autosave). Saves 600 ms after the last keystroke and on blur/unmount.
 * An emptied note is removed (tombstoned), so no blank notes pile up.
 */
export function NoteEditor({ note, documentId, annotationId, placeholder = 'Add a note…', rows = 3, onSaved }: { note?: NoteRecord; documentId?: string; annotationId?: string; placeholder?: string; rows?: number; onSaved?: (n: NoteRecord | undefined) => void }) {
  const store = useStore();
  const toast = useToast();
  const [text, setText] = useState(note?.body ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const idRef = useRef<string | undefined>(note?.id);
  const lastSaved = useRef(note?.body ?? '');

  // Adopt external changes (e.g. edit in another tab) only when the user has no unsaved edits.
  useEffect(() => {
    if (note && note.body !== lastSaved.current && text === lastSaved.current) { setText(note.body); lastSaved.current = note.body; }
    if (note) idRef.current = note.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.body, note?.id]);

  const { call, flush } = useDebouncedCallback(async (body: string) => {
    if (body === lastSaved.current) return;
    setStatus('saving');
    try {
      if (!body.trim()) {
        if (idRef.current) { await store.notes.remove(idRef.current); idRef.current = undefined; }
        lastSaved.current = '';
        onSaved?.(undefined);
      } else {
        const saved = await store.notes.save({ id: idRef.current, documentId, annotationId, body });
        idRef.current = saved.id;
        lastSaved.current = body;
        onSaved?.(saved);
      }
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      toast({ message: err instanceof Error ? err.message : 'Could not save the note', kind: 'error' });
    }
  }, 600);

  return (
    <div className="ann__notebox">
      <TextArea
        aria-label="Note" rows={rows} value={text} placeholder={placeholder} maxLength={200000}
        onChange={(e) => { setText(e.target.value); setStatus('idle'); call(e.target.value); }}
        onBlur={flush}
      />
      <span className="muted" style={{ fontSize: '.78rem', minHeight: '1.2em' }} aria-live="polite">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : ''}
      </span>
    </div>
  );
}
