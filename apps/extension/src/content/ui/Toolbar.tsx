import { IconButton } from '@ukw/ui';
import type { PageController, ControllerState } from '../controller';

const TB_W = 360;
const TB_H = 44;

export function toolbarPosition(rect: { top: number; left: number; width: number; bottom: number }, vw: number, vh: number): { top: number; left: number; below: boolean } {
  const below = rect.top < TB_H + 16;
  const top = below ? Math.min(vh - TB_H - 8, rect.bottom + 8) : rect.top - TB_H - 8;
  const centre = rect.left + rect.width / 2;
  const left = Math.max(8, Math.min(vw - TB_W - 8, centre - TB_W / 2));
  return { top: Math.max(8, top), left, below };
}

/** Floating toolbar shown over a text selection. Buttons never take focus, so the selection survives. */
export function Toolbar({ controller, state }: { controller: PageController; state: ControllerState }) {
  const sel = state.selection;
  if (!sel || state.disabled) return null;
  const pos = toolbarPosition(sel.rect, window.innerWidth, window.innerHeight);
  const keep = (e: React.SyntheticEvent) => e.preventDefault();
  const reattaching = state.reattachId;
  return (
    <div className="ukw-tb" role="toolbar" aria-label="Annotate selection" style={{ top: pos.top, left: pos.left }} onMouseDown={keep} onPointerDown={keep}>
      {reattaching ? (
        <>
          <span style={{ padding: '0 8px', fontSize: '.88rem' }}>Attach to this passage?</span>
          <button type="button" className="ukw-btn ukw-btn--primary ukw-btn--sm" onClick={() => void controller.reattach(reattaching)}>Reattach</button>
        </>
      ) : (
        <>
          {state.settings.palette.map((c) => (
            <button key={c.id} type="button" className="swatch" aria-label={`Highlight: ${c.label}`} title={`Highlight: ${c.label}`} style={{ background: c.hex }} onClick={() => void controller.createFromSelection('highlight', c.hex)} />
          ))}
          <span className="sep" />
          <IconButton size="sm" icon="underline" label="Underline" onClick={() => void controller.createFromSelection('underline')} />
          <IconButton size="sm" icon="strike" label="Strikethrough" onClick={() => void controller.createFromSelection('strike')} />
          <IconButton size="sm" icon="note" label="Highlight and add a note" onClick={() => void controller.createFromSelection('highlight', undefined, { editNote: true })} />
        </>
      )}
    </div>
  );
}
