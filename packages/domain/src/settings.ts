import { DEFAULT_PALETTE, type PaletteColour } from './palette';

export type ThemeMode = 'light' | 'dark' | 'system' | 'dim' | 'high-contrast';
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system', 'dim', 'high-contrast'] as const;

export interface ShortcutMap {
  highlight: string;
  note: string;
  bookmark: string;
  toggleSidebar: string;
  commandPalette: string;
  /** In-page palette (Mod+K collides with many sites, so the extension uses its own key). */
  extensionPalette: string;
  undo: string;
  redo: string;
}

export interface UkwSettings {
  theme: ThemeMode;
  accent: string;
  fontScale: number;
  reducedMotion: boolean;
  palette: PaletteColour[];
  defaultColour: string;
  sidebarWidth: number;
  sidebarSide: 'left' | 'right';
  sidebarOpen: boolean;
  sidebarPinned: boolean;
  /** Hostnames where the extension must stay inactive. */
  disabledSites: string[];
  shortcuts: ShortcutMap;
  /** Cloud sync is opt-in (docs/12 §12.7). */
  syncEnabled: boolean;
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  highlight: 'Alt+H',
  note: 'Alt+N',
  bookmark: 'Alt+B',
  toggleSidebar: 'Alt+S',
  commandPalette: 'Mod+K',
  extensionPalette: 'Alt+K',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
};

export const DEFAULT_SETTINGS: UkwSettings = {
  theme: 'system',
  accent: '#5267e8',
  fontScale: 1,
  reducedMotion: false,
  palette: DEFAULT_PALETTE.map((c) => ({ ...c })),
  defaultColour: DEFAULT_PALETTE[0]!.hex,
  sidebarWidth: 380,
  sidebarSide: 'right',
  sidebarOpen: false,
  sidebarPinned: false,
  disabledSites: [],
  shortcuts: { ...DEFAULT_SHORTCUTS },
  syncEnabled: false,
};

export type SettingKey = keyof UkwSettings;
