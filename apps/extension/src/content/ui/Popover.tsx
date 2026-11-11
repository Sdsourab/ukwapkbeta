import { useEffect, useRef, useState } from 'react';
import { Icon, IconButton, TextArea, useDebouncedCallback } from '@ukw/ui';
import { DEFAULT_HIGHLIGHT_COLOUR } from '@ukw/domain';
import type { ControllerState, PageController } from '../controller';

/** Debounced note editor bound to the controller (autosave; flushes on blur/unmount; empty note removes it). */
export function NoteField({ controller, annotationId, noteId: initialId, initial, autoFocus, rows = 3, placeholder = 'Add a note…' }: { controller: PageController; annotationId?: string; noteId?: string; initial: string; autoFocus?: boolean; rows?: number; placeholder?: string }) {
  const [text, setText] = useState(initial);
  const idRef = useRef(initialId);
  const last = useRef(initial);
  const [status, setStatus] = useState('');
  useEffect(() => { idRef.current = initialId; }, [initialId]);
  const { call, flush } = useDebouncedCallback(async (body: string) => {
    if (body === last.current) return;
    setStatus('Saving…');
    idRef.current = await controller.saveNote(annotationId, body, idRef.current);
    last.current = body;
    setStatus('Saved');
  }, 600);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <TextArea aria-label="Note" rows={rows} value={text} autoFocus={autoFocus} placeholder={placeholder} onChange={(e) => { setText(e.target.value); setStatus(''); call(e.target.value); }} onBlur={flush} onKeyDown={(e) => e.stopPropagation()} />
      <span className="muted" style={{ fontSize: '.75rem', minHeight: '1.1em' }} aria-live="polite">{status}</span>
    </div>
  );
}

/** Opens next to a clicked highlight: change colour/type, edit the note, delete, send to a graph. */
export function Popover({ controller, state, onGraph }: { controller: PageController; state: ControllerState; onGraph: (annotationId: string) => void }) {
  const id = state.activeId;
  const a = state.annotations.find((x) => x.id === id);
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    window.addEventListener('scroll', on, { passive: true, capture: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on, { capture: true } as EventListenerOptions); window.removeEventListener('resize', on); };
  }, []);
  if (!a || state.sidebarOpen) return null;
  const rect = controller.rectOf(a.id);
  const vw = window.innerWidth, vh = window.innerHeight;
  const W = Math.min(340, vw - 16);
  const left = rect ? Math.max(8, Math.min(vw - W - 8, rect.left)) : Math.max(8, vw / 2 - W / 2);
  const wantTop = rect ? rect.bottom + 8 : 80;
  const top = wantTop + 260 > vh ? Math.max(8, (rect ? rect.top : 80) - 270) : wantTop;
  const note = (state.notesByAnnotation[a.id] ?? [])[0];
  const colour = a.colour ?? DEFAULT_HIGHLIGHT_COLOUR;
  return (
    <div className="ukw-pop" role="dialog" aria-label="Annotation" style={{ top, left, ['--hl' as string]: colour }} onKeyDown={(e) => { if (e.key === 'Escape') controller.setActive(null); e.stopPropagation(); }}>
      {a.anchor ? <div className="ukw-pop__quote">{a.anchor.exact}</div> : <strong>{a.label}</strong>}
      <div className="ukw-row" role="radiogroup" aria-label="Colour">
        {state.settings.palette.map((c) => <button key={c.id} type="button" role="radio" aria-checked={c.hex.toLowerCase() === colour.toLowerCase()} aria-label={c.label} title={c.label} className={`ukw-sw${c.hex.toLowerCase() === colour.toLowerCase() ? ' is-selected' : ''}`} style={{ background: c.hex }} onClick={() => void controller.updateAnnotation(a.id, { colour: c.hex })} />)}
        <span className="grow" />
        {(['highlight', 'underline', 'strike'] as const).map((t) => <IconButton key={t} size="sm" icon={t} label={t === 'strike' ? 'Strikethrough' : t[0]!.toUpperCase() + t.slice(1)} active={a.type === t} onClick={() => void controller.updateAnnotation(a.id, { type: t })} />)}
      </div>
      <NoteField key={`${a.id}-${state.focusNote}`} controller={controller} annotationId={a.id} noteId={note?.id} initial={note?.body ?? ''} autoFocus={state.focusNote} rows={3} />
      <div className="ukw-row">
        <IconButton size="sm" icon="graph" label="Add to graph" onClick={() => onGraph(a.id)} />
        <IconButton size="sm" icon="star" label={a.isFavorite ? 'Remove favorite' : 'Favorite'} active={a.isFavorite} onClick={() => void controller.updateAnnotation(a.id, { isFavorite: !a.isFavorite })} />
        <IconButton size="sm" icon="trash" label="Delete" onClick={() => void controller.deleteAnnotation(a.id)} />
        <span className="grow" />
        <IconButton size="sm" icon="x" label="Close" onClick={() => controller.setActive(null)} />
      </div>
      {void Icon}
    </div>
  );
}
