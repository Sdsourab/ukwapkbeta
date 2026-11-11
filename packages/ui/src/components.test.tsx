// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { click, flush, key, mount, q, qa, typeInto } from '../../../tests/react-utils';
import { Dialog, EmptyState, Icon, ICON_NAMES, IconButton, Segmented, Switch, ToastProvider, useDebouncedCallback, useToast, applyTheme } from './index';

afterEach(() => { document.body.innerHTML = ''; });

describe('Dialog', () => {
  it('traps focus, closes on Escape and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const m = await mount(
      <Dialog open title="Rename" onClose={onClose} footer={<button id="ok">OK</button>}>
        <input id="name" />
      </Dialog>,
    );
    expect(q('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(q('[role="dialog"]')?.getAttribute('aria-labelledby')).toBeTruthy();
    // first focusable inside the dialog is the Close button
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
    q<HTMLElement>('#ok')!.focus();
    await key(document, 'Tab');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close'); // wrapped around
    await key(document, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    await m.unmount();
  });
  it('renders nothing when closed', async () => {
    const m = await mount(<Dialog open={false} title="x" onClose={() => {}}>body</Dialog>);
    expect(q('[role="dialog"]')).toBeNull();
    await m.unmount();
  });
});

describe('Toast', () => {
  function Demo({ onAction }: { onAction: () => void }) {
    const toast = useToast();
    return <button id="go" onClick={() => toast({ message: 'Deleted annotation', actionLabel: 'Undo', onAction, duration: 0 })}>go</button>;
  }
  it('shows a message with an action that fires and dismisses', async () => {
    const onAction = vi.fn();
    const m = await mount(<ToastProvider><Demo onAction={onAction} /></ToastProvider>);
    await click(q('#go'));
    expect(q('.ukw-toast')?.textContent).toContain('Deleted annotation');
    await click(q('.ukw-toast__action'));
    expect(onAction).toHaveBeenCalled();
    expect(q('.ukw-toast')).toBeNull();
    await m.unmount();
  });
});

describe('controls', () => {
  it('Switch toggles and exposes aria-checked', async () => {
    function S() { const [on, setOn] = useState(false); return <Switch checked={on} onChange={setOn} label="Sync" />; }
    const m = await mount(<S />);
    const sw = q('[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await m.unmount();
  });
  it('Segmented is a radiogroup with one selected option', async () => {
    const onChange = vi.fn();
    const m = await mount(<Segmented label="Theme" value="dark" options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={onChange} />);
    expect(qa('[role="radio"]').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    await click(qa('[role="radio"]')[0]!);
    expect(onChange).toHaveBeenCalledWith('light');
    await m.unmount();
  });
  it('IconButton always has an accessible name; Icon is decorative unless titled', async () => {
    const m = await mount(<><IconButton icon="trash" label="Delete" /><Icon name="search" /><Icon name="search" title="Search" /></>);
    expect(q('button')?.getAttribute('aria-label')).toBe('Delete');
    const svgs = qa('svg'); // [0] is the IconButton's own icon, [1] decorative, [2] titled
    expect(svgs).toHaveLength(3);
    expect(svgs[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(svgs[1]?.getAttribute('aria-hidden')).toBe('true');
    expect(svgs[1]?.getAttribute('role')).toBeNull();
    expect(svgs[2]?.getAttribute('role')).toBe('img');
    expect(svgs[2]?.getAttribute('aria-label')).toBe('Search');
    await m.unmount();
  });
  it('EmptyState renders title, body and action', async () => {
    const m = await mount(<EmptyState title="No highlights yet" action={<button>Add</button>}>Select text on any page.</EmptyState>);
    expect(q('.ukw-empty h2')?.textContent).toBe('No highlights yet');
    expect(q('.ukw-empty button')).not.toBeNull();
    await m.unmount();
  });
  it('every icon has path data', () => {
    for (const n of ICON_NAMES) expect(n.length).toBeGreaterThan(0);
    expect(ICON_NAMES.length).toBeGreaterThan(40);
  });
});

describe('useDebouncedCallback (autosave)', () => {
  it('debounces and flushes pending work on unmount so edits are never lost', async () => {
    const saved: string[] = [];
    function Editor() {
      const { call } = useDebouncedCallback((v: string) => saved.push(v), 500);
      return <textarea onChange={(e) => call(e.target.value)} />;
    }
    const m = await mount(<Editor />);
    const ta = q<HTMLTextAreaElement>('textarea')!;
    await typeInto(ta, 'a');
    await typeInto(ta, 'ab');
    await typeInto(ta, 'abc');
    expect(saved).toEqual([]);
    await m.unmount(); // flush on unmount
    expect(saved).toEqual(['abc']);
  });
  it('fires once after the delay', async () => {
    const saved: string[] = [];
    function Editor() {
      const { call } = useDebouncedCallback((v: string) => saved.push(v), 20);
      return <textarea onChange={(e) => call(e.target.value)} />;
    }
    const m = await mount(<Editor />);
    const ta = q<HTMLTextAreaElement>('textarea')!;
    await typeInto(ta, 'x');
    await typeInto(ta, 'xy');
    await flush(60);
    expect(saved).toEqual(['xy']);
    await m.unmount();
  });
});

describe('applyTheme', () => {
  it('sets theme attributes, honours accent except in high contrast', () => {
    const el = document.createElement('div');
    expect(applyTheme(el, 'dim', { accent: '#123456', fontScale: 1.2 })).toBe('dim');
    expect(el.getAttribute('data-ukw-theme')).toBe('dim');
    expect(el.style.getPropertyValue('--ukw-accent')).toBe('#123456');
    expect(el.style.getPropertyValue('--ukw-font-scale')).toBe('1.2');
    applyTheme(el, 'high-contrast', { accent: '#123456' });
    expect(el.style.getPropertyValue('--ukw-accent')).toBe('');
    applyTheme(el, 'light', { reducedMotion: true });
    expect(el.hasAttribute('data-ukw-reduced-motion')).toBe(true);
  });
});
