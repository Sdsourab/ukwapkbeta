import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE } from '@ukw/domain';
import { THEMES, contrastRatio, resolveTheme, themeCss, type ResolvedTheme } from './index';

const names = Object.keys(THEMES) as ResolvedTheme[];

describe('contrastRatio reference values', () => {
  it('matches known WCAG results', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1); // famous just-below-AA grey
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme contrast (WCAG)', () => {
  it.each(names)('%s: body text on bg and surfaces is at least AA (4.5:1)', (name) => {
    const t = THEMES[name];
    for (const bg of [t.bg, t.surface, t.surface2, t.surface3]) expect(contrastRatio(t.text, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(names)('%s: muted text on bg/surface/surface2 is at least AA', (name) => {
    const t = THEMES[name];
    for (const bg of [t.bg, t.surface, t.surface2]) expect(contrastRatio(t.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(names)('%s: accent text on accent, accent on surface, danger on surface are readable', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.accentText, t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.accent, t.surface)).toBeGreaterThanOrEqual(3); // UI components (WCAG 1.4.11)
    expect(contrastRatio(t.danger, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.text, t.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.focus, t.bg)).toBeGreaterThanOrEqual(3);
  });
  it('high contrast meets AAA (7:1) for text and borders', () => {
    const t = THEMES['high-contrast'];
    expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(t.textMuted, t.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(t.border, t.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(t.accentText, t.accent)).toBeGreaterThanOrEqual(7);
  });
  it('dark text stays legible over every default highlight colour (marker look)', () => {
    // Highlights are drawn as translucent washes; text keeps the page colour. Check worst case: text over solid swatch.
    for (const c of DEFAULT_PALETTE) expect(contrastRatio('#1d1c19', c.hex)).toBeGreaterThanOrEqual(7);
  });
});

describe('theme engine', () => {
  it('resolves system mode from the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dim', true)).toBe('dim');
  });
  it('emits CSS for every theme', () => {
    const css = themeCss();
    for (const n of names) expect(css).toContain(`[data-ukw-theme="${n}"]`);
    expect(css).toContain('--ukw-accent:');
  });
});
