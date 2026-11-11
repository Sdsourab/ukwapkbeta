import { DEFAULT_SETTINGS, THEME_MODES, UkwError, isHexColour, newId, nowIso, SCHEMA_VERSION, type SettingKey, type UkwSettings } from '@ukw/domain';
import type { StoreContext } from './context';

function validate<K extends SettingKey>(key: K, value: unknown): UkwSettings[K] {
  const bad = (m: string): never => {
    throw new UkwError('VALIDATION_ERROR', `Invalid setting "${key}": ${m}`);
  };
  switch (key) {
    case 'theme':
      if (!(THEME_MODES as readonly unknown[]).includes(value)) bad('unknown theme');
      break;
    case 'accent':
    case 'defaultColour':
      if (!isHexColour(value)) bad('expected a hex colour');
      break;
    case 'fontScale':
      if (typeof value !== 'number' || value < 0.75 || value > 1.75) bad('expected a number between 0.75 and 1.75');
      break;
    case 'sidebarWidth':
      if (typeof value !== 'number' || value < 280 || value > 720) bad('expected a width between 280 and 720');
      break;
    case 'sidebarSide':
      if (value !== 'left' && value !== 'right') bad('expected left or right');
      break;
    case 'reducedMotion':
    case 'sidebarOpen':
    case 'sidebarPinned':
    case 'syncEnabled':
      if (typeof value !== 'boolean') bad('expected true or false');
      break;
    case 'disabledSites':
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.length > 253)) bad('expected a list of hostnames');
      break;
    case 'palette':
      if (!Array.isArray(value) || value.length === 0 || value.length > 24 || value.some((c) => !c || typeof c.id !== 'string' || typeof c.label !== 'string' || !isHexColour(c.hex))) bad('expected a list of {id,label,hex}');
      break;
    case 'shortcuts':
      if (typeof value !== 'object' || value === null || Object.values(value).some((v) => typeof v !== 'string')) bad('expected a map of shortcuts');
      break;
  }
  return value as UkwSettings[K];
}

export class SettingsRepository {
  constructor(private readonly ctx: StoreContext) {}

  async getAll(): Promise<UkwSettings> {
    const rows = await this.ctx.db.settings.toArray();
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
    return merged as unknown as UkwSettings;
  }

  async get<K extends SettingKey>(key: K): Promise<UkwSettings[K]> {
    const row = await this.ctx.db.settings.get(key);
    return (row ? row.value : DEFAULT_SETTINGS[key]) as UkwSettings[K];
  }

  async set<K extends SettingKey>(key: K, value: UkwSettings[K]): Promise<void> {
    const v = validate(key, value);
    const { db } = this.ctx;
    await db.transaction('rw', [db.settings, db.syncQueue], async () => {
      await db.settings.put({ key, value: v, updatedAt: nowIso() });
      const existing = await db.syncQueue.where('[entityType+recordId]').equals(['settings', key]).toArray();
      if (existing.length) await db.syncQueue.bulkDelete(existing.map((e) => e.sequence!));
      await db.syncQueue.add({ opId: newId(), entityType: 'settings', recordId: key, operation: 'upsert', rev: 0, schemaVersion: SCHEMA_VERSION, clientTimestamp: nowIso(), createdAt: nowIso(), attempts: 0 });
    });
    this.ctx.notifyChange(['settings'], 'update');
  }
}
