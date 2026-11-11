/// <reference types="chrome" />
import { applyTheme, uiCss } from '@ukw/ui';
import { DEFAULT_SETTINGS, makeMessage, newId, type ContentCommand, type ExtensionResponse, type UkwSettings } from '@ukw/domain';

interface TabStatus { annotations: number; orphaned: number; sidebarOpen: boolean; disabled: boolean; hostname: string; supported: boolean }

async function call<T = unknown>(type: Parameters<typeof makeMessage>[1], payload: never): Promise<T> {
  const res = (await chrome.runtime.sendMessage(makeMessage(newId(), type, payload))) as ExtensionResponse<T>;
  if (!res?.ok) throw new Error(res?.error?.message ?? 'Request failed');
  return res.data as T;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) e.className = String(cls);
  Object.assign(e, rest);
  e.append(...kids);
  return e;
}

async function main() {
  const style = document.createElement('style');
  style.textContent = `${uiCss()}
    .pp{padding:14px;display:grid;gap:10px;min-width:292px}.pp h1{font-size:1.05rem}.pp .m{color:var(--ukw-text-muted);font-size:.86rem}
    .pp .g{display:grid;gap:6px}.pp button{justify-content:flex-start}.pp .st{border:1px solid var(--ukw-border);border-radius:12px;padding:10px 12px;background:var(--ukw-surface)}
    .pp .st b{font-family:var(--ukw-font-display);font-size:1.4rem}`;
  document.head.appendChild(style);
  const root = document.getElementById('root')!;

  let settings: UkwSettings = DEFAULT_SETTINGS;
  try { settings = { ...DEFAULT_SETTINGS, ...(await call<UkwSettings>('SETTINGS_GET', {} as never)) }; } catch { /* defaults */ }
  applyTheme(root, settings.theme, { accent: settings.accent, fontScale: settings.fontScale, reducedMotion: settings.reducedMotion });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let status: TabStatus | null = null;
  if (tab?.id !== undefined) {
    try { status = (await chrome.tabs.sendMessage(tab.id, { ukw: 'command', command: 'get-status' })) as TabStatus; } catch { status = null; }
  }

  const send = async (command: ContentCommand) => { if (tab?.id !== undefined) { await chrome.tabs.sendMessage(tab.id, { ukw: 'command', command }).catch(() => undefined); window.close(); } };
  const open = async (path: string) => { await call('OPEN_DASHBOARD', { path } as never); window.close(); };
  const btn = (label: string, onClick: () => void, variant = '') => h('button', { class: `ukw-btn ${variant}`, type: 'button', textContent: label, onclick: onClick });

  const box = h('div', { class: 'pp' }, h('h1', { textContent: 'Universal Knowledge Workspace' }));

  if (status && status.supported && !status.disabled) {
    box.append(h('div', { class: 'st' }, h('b', { textContent: String(status.annotations) }), ` annotation${status.annotations === 1 ? '' : 's'} on this page`, h('div', { class: 'm', textContent: status.orphaned ? `${status.orphaned} could not be located after the page changed` : status.hostname })));
    box.append(h('div', { class: 'g' },
      btn(status.sidebarOpen ? 'Close sidebar' : 'Open sidebar', () => void send('toggle-sidebar'), 'ukw-btn--primary'),
      btn('Highlight selected text', () => void send('highlight-selection')),
      btn('Bookmark this spot', () => void send('add-bookmark')),
    ));
    box.append(btn('Turn off on this site', async () => {
      await call('SETTINGS_UPDATE', { key: 'disabledSites', value: [...new Set([...settings.disabledSites, status!.hostname])] } as never);
      window.close();
    }, 'ukw-btn--ghost'));
  } else if (status?.disabled) {
    box.append(h('div', { class: 'st' }, `Turned off on ${status.hostname}`));
    box.append(btn('Turn on for this site', async () => {
      await call('SETTINGS_UPDATE', { key: 'disabledSites', value: settings.disabledSites.filter((x) => x !== status!.hostname) } as never);
      window.close();
    }, 'ukw-btn--primary'));
  } else {
    const web = /^https?:\/\//i.test(tab?.url ?? '');
    box.append(h('div', { class: 'st m', textContent: web ? 'Reload this page to start annotating it (it was open before the extension started).' : 'This kind of page cannot be annotated. Browser pages, the web store and local files are off limits.' }));
  }

  box.append(h('div', { class: 'g' },
    btn('Open library', () => void open('/'), 'ukw-btn--ghost'),
    btn('Graphs', () => void open('/graphs'), 'ukw-btn--ghost'),
    btn('Settings', () => void open('/settings'), 'ukw-btn--ghost'),
  ));
  root.append(box);
}

void main();
