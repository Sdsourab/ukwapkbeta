import { THEME_MODES, type ThemeMode } from '@ukw/domain';
import { THEMES, type ResolvedTheme, type ThemeTokens } from './tokens';

const KEBAB = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function isThemeMode(v: unknown): v is ThemeMode {
  return (THEME_MODES as readonly unknown[]).includes(v);
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean = systemPrefersDark()): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

export function tokensToCssVars(t: ThemeTokens, accentOverride?: string): string {
  const vars: Record<string, string> = {
    bg: t.bg, surface: t.surface, 'surface-2': t.surface2, 'surface-3': t.surface3, border: t.border, 'border-strong': t.borderStrong,
    text: t.text, 'text-muted': t.textMuted, accent: accentOverride ?? t.accent, 'accent-text': t.accentText, 'accent-soft': t.accentSoft,
    danger: t.danger, 'danger-soft': t.dangerSoft, success: t.success, focus: t.focus, overlay: t.overlay, shadow: t.shadow,
  };
  return Object.entries(vars).map(([k, v]) => `--ukw-${KEBAB(k)}:${v};`).join('') + `color-scheme:${t.scheme};`;
}

/** CSS declaring every theme as `[data-ukw-theme="…"]` so it works on :root and inside shadow roots. */
export function themeCss(): string {
  return (Object.keys(THEMES) as ResolvedTheme[]).map((name) => `[data-ukw-theme="${name}"]{${tokensToCssVars(THEMES[name])}}`).join('\n');
}

export interface ApplyThemeOptions {
  /** User accent override (only honoured outside high-contrast mode, which needs its own accent). */
  accent?: string;
  fontScale?: number;
  reducedMotion?: boolean;
}

/** Applies a theme to an element (document root in the PWA, shadow host in the extension). */
export function applyTheme(el: HTMLElement, mode: ThemeMode, opts: ApplyThemeOptions = {}): ResolvedTheme {
  const resolved = resolveTheme(mode);
  el.setAttribute('data-ukw-theme', resolved);
  el.setAttribute('data-ukw-theme-mode', mode);
  if (opts.accent && resolved !== 'high-contrast') el.style.setProperty('--ukw-accent', opts.accent);
  else el.style.removeProperty('--ukw-accent');
  if (opts.fontScale) el.style.setProperty('--ukw-font-scale', String(opts.fontScale));
  el.toggleAttribute('data-ukw-reduced-motion', !!opts.reducedMotion);
  return resolved;
}

/** Re-applies `system` mode when the OS preference changes. Returns an unsubscribe function. */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
