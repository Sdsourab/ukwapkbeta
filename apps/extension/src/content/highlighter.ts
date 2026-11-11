import { hexToRgba, isHexColour } from '@ukw/domain';

export type PaintType = 'highlight' | 'underline' | 'strike';

export interface PaintEntry {
  id: string;
  type: PaintType;
  colour: string;
  range: Range;
}

/** Draws annotations over the page without modifying its DOM text structure. */
export interface HighlightRenderer {
  readonly kind: 'css-highlight' | 'overlay' | 'none';
  paint(entries: PaintEntry[]): void;
  clear(): void;
  /** Id of the topmost annotation under the viewport point, if any. */
  hitTest(x: number, y: number): string | null;
  destroy(): void;
}

const safeHex = (c: string) => (isHexColour(c) ? (c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c) : '#F6D86B').toLowerCase();

function insideRects(range: Range, x: number, y: number, slop = 1.5): boolean {
  const rects = range.getClientRects();
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop) return true;
  }
  return false;
}

export function cssHighlightsSupported(win: Window & typeof globalThis = window as never): boolean {
  return typeof win.CSS !== 'undefined' && 'highlights' in win.CSS && typeof (win as unknown as { Highlight?: unknown }).Highlight === 'function';
}

/**
 * Preferred renderer: CSS Custom Highlight API. Styles live in an adopted stylesheet, which is not
 * blocked by page Content-Security-Policy and adds no elements to the page.
 */
export class CustomHighlightRenderer implements HighlightRenderer {
  readonly kind = 'css-highlight' as const;
  private entries: PaintEntry[] = [];
  private names = new Set<string>();
  private sheet: CSSStyleSheet | null = null;
  private fallbackStyle: HTMLStyleElement | null = null;
  private rules = new Map<string, string>();

  constructor(private readonly doc: Document, private readonly win: Window & typeof globalThis = window as never) {}

  private nameFor(e: PaintEntry): string {
    return `ukw-${e.type === 'highlight' ? 'h' : e.type === 'underline' ? 'u' : 's'}-${safeHex(e.colour).slice(1)}`;
  }

  private ruleFor(e: PaintEntry): string {
    const hex = safeHex(e.colour);
    const name = this.nameFor(e);
    if (e.type === 'highlight') return `::highlight(${name}){background-color:${hexToRgba(hex, 0.5)};}`;
    if (e.type === 'underline') return `::highlight(${name}){text-decoration:underline;text-decoration-color:${hex};text-decoration-thickness:3px;}`;
    return `::highlight(${name}){text-decoration:line-through;text-decoration-color:${hex};text-decoration-thickness:3px;}`;
  }

  private syncStyles(): void {
    const css = [...this.rules.values()].join('\n');
    try {
      if (!this.sheet) {
        this.sheet = new this.win.CSSStyleSheet();
        this.doc.adoptedStyleSheets = [...this.doc.adoptedStyleSheets, this.sheet];
      }
      this.sheet.replaceSync(css);
    } catch {
      // Older engines without constructable stylesheets.
      if (!this.fallbackStyle) {
        this.fallbackStyle = this.doc.createElement('style');
        this.fallbackStyle.setAttribute('data-ukw-ui', '');
        (this.doc.head ?? this.doc.documentElement).appendChild(this.fallbackStyle);
      }
      this.fallbackStyle.textContent = css;
    }
  }

  paint(entries: PaintEntry[]): void {
    this.entries = entries;
    const groups = new Map<string, Range[]>();
    for (const e of entries) {
      const name = this.nameFor(e);
      if (!this.rules.has(name)) this.rules.set(name, this.ruleFor(e));
      (groups.get(name) ?? groups.set(name, []).get(name)!).push(e.range);
    }
    this.syncStyles();
    const registry = this.win.CSS.highlights!;
    for (const old of this.names) if (!groups.has(old)) registry.delete(old);
    for (const [name, ranges] of groups) registry.set(name, new (this.win as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight(...ranges) as never);
    this.names = new Set(groups.keys());
  }

  clear(): void {
    this.paint([]);
  }

  hitTest(x: number, y: number): string | null {
    for (let i = this.entries.length - 1; i >= 0; i--) if (insideRects(this.entries[i]!.range, x, y)) return this.entries[i]!.id;
    return null;
  }

  destroy(): void {
    const registry = this.win.CSS?.highlights;
    for (const n of this.names) registry?.delete(n);
    this.names.clear();
    this.entries = [];
    if (this.sheet) this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((s) => s !== this.sheet);
    this.fallbackStyle?.remove();
  }
}

/**
 * Fallback for browsers without the Custom Highlight API: absolutely positioned, pointer-transparent
 * rectangles in a single container, recomputed on resize and when asked to repaint.
 */
export class OverlayRenderer implements HighlightRenderer {
  readonly kind = 'overlay' as const;
  private container: HTMLElement | null = null;
  private entries: PaintEntry[] = [];
  private readonly onResize = () => this.layout();

  constructor(private readonly doc: Document, private readonly win: Window = window) {
    win.addEventListener('resize', this.onResize);
  }

  private ensure(): HTMLElement {
    if (!this.container) {
      const c = this.doc.createElement('div');
      c.setAttribute('data-ukw-ui', '');
      c.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;';
      this.doc.documentElement.appendChild(c);
      this.container = c;
    }
    return this.container;
  }

  private layout(): void {
    const c = this.ensure();
    c.textContent = '';
    const sx = this.win.scrollX, sy = this.win.scrollY;
    for (const e of this.entries) {
      const hex = safeHex(e.colour);
      const rects = e.range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]!;
        const d = this.doc.createElement('div');
        const base = `position:absolute;left:${r.left + sx}px;top:${r.top + sy}px;width:${r.width}px;height:${r.height}px;`;
        d.style.cssText = e.type === 'highlight' ? `${base}background:${hexToRgba(hex, 0.45)};mix-blend-mode:multiply;` : e.type === 'underline' ? `${base}border-bottom:3px solid ${hex};box-sizing:border-box;` : `${base}background:linear-gradient(transparent 46%,${hex} 46%,${hex} 56%,transparent 56%);`;
        c.appendChild(d);
      }
    }
  }

  paint(entries: PaintEntry[]): void {
    this.entries = entries;
    this.layout();
  }
  clear(): void {
    this.paint([]);
  }
  hitTest(x: number, y: number): string | null {
    for (let i = this.entries.length - 1; i >= 0; i--) if (insideRects(this.entries[i]!.range, x, y)) return this.entries[i]!.id;
    return null;
  }
  destroy(): void {
    this.win.removeEventListener('resize', this.onResize);
    this.container?.remove();
    this.container = null;
    this.entries = [];
  }
}

export function createRenderer(doc: Document, win: Window & typeof globalThis = window as never): HighlightRenderer {
  return cssHighlightsSupported(win) ? new CustomHighlightRenderer(doc, win) : new OverlayRenderer(doc, win);
}
