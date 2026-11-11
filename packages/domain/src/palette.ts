export interface PaletteColour {
  id: string;
  /** Default (renamable) label; users may attach their own meaning (docs/04 §4.7). */
  label: string;
  hex: string;
}

/** Default semantic highlight palette. Rendered with alpha so text remains legible in every theme. */
export const DEFAULT_PALETTE: readonly PaletteColour[] = [
  { id: 'yellow', label: 'Important', hex: '#F6D86B' },
  { id: 'green', label: 'Evidence', hex: '#7ED6A5' },
  { id: 'blue', label: 'Concept', hex: '#8FB8FF' },
  { id: 'pink', label: 'Question', hex: '#FF9FC2' },
  { id: 'orange', label: 'Follow-up', hex: '#FFB471' },
  { id: 'purple', label: 'Insight', hex: '#C3A4FF' },
] as const;

export const DEFAULT_HIGHLIGHT_COLOUR = DEFAULT_PALETTE[0]!.hex;

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/** Converts `#rgb`/`#rrggbb` to an `rgba()` string. Falls back to the default colour for invalid input. */
export function hexToRgba(hex: string, alpha: number): string {
  const safe = isHexColour(hex) ? hex : DEFAULT_HIGHLIGHT_COLOUR;
  const h = safe.slice(1);
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
