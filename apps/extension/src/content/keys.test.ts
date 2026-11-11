// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEditableTarget, matchesShortcut, parseShortcut } from './keys';

const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('shortcuts', () => {
  it('parses and rejects', () => {
    expect(parseShortcut('Alt+H')).toMatchObject({ key: 'h', alt: true, mod: false });
    expect(parseShortcut('Mod+Shift+Z')).toMatchObject({ key: 'z', mod: true, shift: true });
    expect(parseShortcut('Hyper+H')).toBeNull();
    expect(parseShortcut('')).toBeNull();
  });
  it('matches on the physical key so macOS Alt combos work', () => {
    const spec = parseShortcut('Alt+H')!;
    expect(matchesShortcut(ev({ key: 'h', code: 'KeyH', altKey: true }), spec, false)).toBe(true);
    expect(matchesShortcut(ev({ key: '˙', code: 'KeyH', altKey: true }), spec, true)).toBe(true); // mac Alt+H produces ˙
    expect(matchesShortcut(ev({ key: 'h', code: 'KeyH' }), spec, false)).toBe(false);
    expect(matchesShortcut(ev({ key: 'h', code: 'KeyH', altKey: true, shiftKey: true }), spec, false)).toBe(false);
  });
  it('maps Mod to Ctrl or Cmd per platform', () => {
    const spec = parseShortcut('Mod+K')!;
    expect(matchesShortcut(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), spec, false)).toBe(true);
    expect(matchesShortcut(ev({ key: 'k', code: 'KeyK', metaKey: true }), spec, false)).toBe(false);
    expect(matchesShortcut(ev({ key: 'k', code: 'KeyK', metaKey: true }), spec, true)).toBe(true);
  });
  it('detects editable targets', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
