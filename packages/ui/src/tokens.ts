import type { ThemeMode } from '@ukw/domain';

/** A resolved (non-system) theme. `system` maps to light or dark at runtime. */
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export interface ThemeTokens {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string; // text colour on top of accent
  accentSoft: string; // tinted accent background
  danger: string;
  dangerSoft: string;
  success: string;
  focus: string;
  overlay: string;
  shadow: string;
  scheme: 'light' | 'dark';
}

/**
 * Paper-and-ink palette: warm paper in light mode, graphite in dark, slate in dim, pure
 * black/white/yellow in high contrast. Text/background pairs are contrast-tested (tokens.test.ts).
 */
export const THEMES: Record<ResolvedTheme, ThemeTokens> = {
  light: {
    bg: '#f6f3ec', surface: '#fffefb', surface2: '#efebe1', surface3: '#e6e1d4',
    border: '#d9d3c4', borderStrong: '#b9b2a0',
    text: '#1d1c19', textMuted: '#5b574d',
    accent: '#3a49c9', accentText: '#ffffff', accentSoft: '#e4e7fb',
    danger: '#b3261e', dangerSoft: '#fbe5e3', success: '#1f7a46', focus: '#3a49c9',
    overlay: 'rgba(24, 22, 16, 0.45)', shadow: '0 1px 2px rgba(40,34,20,.08), 0 6px 20px rgba(40,34,20,.08)', scheme: 'light',
  },
  dark: {
    bg: '#111215', surface: '#1a1b20', surface2: '#23252b', surface3: '#2d3037',
    border: '#33363e', borderStrong: '#4b4f5a',
    text: '#ecebe6', textMuted: '#a7a59d',
    accent: '#9aa6ff', accentText: '#10122b', accentSoft: '#262a52',
    danger: '#ff8a80', dangerSoft: '#3d1f1d', success: '#6fd79c', focus: '#9aa6ff',
    overlay: 'rgba(0, 0, 0, 0.6)', shadow: '0 1px 2px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.45)', scheme: 'dark',
  },
  dim: {
    bg: '#18212d', surface: '#202b3a', surface2: '#293648', surface3: '#334257',
    border: '#3a4a5f', borderStrong: '#566a84',
    text: '#e6ebf2', textMuted: '#a9b6c6',
    accent: '#8fb0ff', accentText: '#0c1730', accentSoft: '#26385c',
    danger: '#ff948a', dangerSoft: '#46282a', success: '#7ddba4', focus: '#8fb0ff',
    overlay: 'rgba(6, 12, 20, 0.6)', shadow: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35)', scheme: 'dark',
  },
  'high-contrast': {
    bg: '#000000', surface: '#000000', surface2: '#141414', surface3: '#222222',
    border: '#ffffff', borderStrong: '#ffffff',
    text: '#ffffff', textMuted: '#e6e6e6',
    accent: '#ffd60a', accentText: '#000000', accentSoft: '#2b2500',
    danger: '#ff6b6b', dangerSoft: '#330000', success: '#4dff9a', focus: '#00e5ff',
    overlay: 'rgba(0, 0, 0, 0.85)', shadow: 'none', scheme: 'dark',
  },
};

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
  dim: 'Dim',
  'high-contrast': 'High contrast',
};

/* ------------------------------------------------------------------ contrast */

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio between two hex colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
