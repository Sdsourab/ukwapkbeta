export interface ShortcutSpec {
  key: string;
  alt: boolean;
  shift: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
}

export function parseShortcut(s: string): ShortcutSpec | null {
  const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1]!.toLowerCase();
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  const known = new Set(['alt', 'shift', 'mod', 'ctrl', 'control', 'meta', 'cmd']);
  for (const m of mods) if (!known.has(m)) return null;
  return { key, alt: mods.has('alt'), shift: mods.has('shift'), mod: mods.has('mod'), ctrl: mods.has('ctrl') || mods.has('control'), meta: mods.has('meta') || mods.has('cmd') };
}

export function isMac(nav: { platform?: string } = typeof navigator !== 'undefined' ? navigator : {}): boolean {
  return /mac|iphone|ipad/i.test(nav.platform ?? '');
}

/** Physical key for letters so Alt combos work on layouts where Alt changes the produced character (macOS). */
function eventKey(e: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  return e.key.toLowerCase();
}

export function matchesShortcut(e: KeyboardEvent, spec: ShortcutSpec, mac = isMac()): boolean {
  const wantCtrl = spec.ctrl || (spec.mod && !mac);
  const wantMeta = spec.meta || (spec.mod && mac);
  return eventKey(e) === spec.key && e.altKey === spec.alt && e.shiftKey === spec.shift && e.ctrlKey === wantCtrl && e.metaKey === wantMeta;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
}
