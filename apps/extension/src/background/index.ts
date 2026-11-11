/// <reference types="chrome" />
import { openStore, type DataStore } from '@ukw/database';
import { CONTENT_COMMANDS, type ContentCommand } from '@ukw/domain';
import { handleRaw, type RouterActions } from './router';

/**
 * MV3 service worker. It owns the extension's database; content scripts and extension pages talk to it
 * through validated messages. Listeners are registered synchronously at top level (MV3 requirement).
 * The worker can be stopped at any time: all state that matters lives in IndexedDB.
 */
const storePromise: Promise<DataStore> = openStore({ name: 'ukw-ext' });

const actions: RouterActions = {
  async openDashboard(path = '/') {
    const clean = path.startsWith('/') ? path : `/${path}`;
    await chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html#${clean}`) });
  },
};

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  void (async () => {
    try {
      const store = await storePromise;
      sendResponse(await handleRaw({ store, selfId: chrome.runtime.id, actions }, raw, { extensionId: sender.id, url: sender.url, tabId: sender.tab?.id }));
    } catch (err) {
      sendResponse({ id: (raw as { id?: string })?.id ?? '', ok: false, error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error', recoverable: true } });
    }
  })();
  return true; // keep the channel open for the async response
});

// Tell every tab's content script when data changed, so highlights and the sidebar stay in sync (coalesced).
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
void storePromise.then((store) => {
  store.subscribe((e) => {
    e.entityTypes.forEach((t) => pending.add(t));
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const entityTypes = [...pending];
      pending = new Set();
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, { ukw: 'changed', entityTypes }).catch(() => undefined);
    }, 60);
  });
});

async function sendToActiveTab(command: ContentCommand) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { ukw: 'command', command }).catch(() => undefined);
}

chrome.commands.onCommand.addListener((name) => {
  if ((CONTENT_COMMANDS as readonly string[]).includes(name)) void sendToActiveTab(name as ContentCommand);
});

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ukw-highlight', title: 'Highlight selection', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ukw-note', title: 'Highlight and add a note…', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ukw-sidebar', title: 'Open workspace sidebar', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'ukw-dashboard', title: 'Open library', contexts: ['action'] });
  });
  if (details.reason === 'install') void actions.openDashboard('/');
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ukw-dashboard') { void actions.openDashboard('/'); return; }
  const command: ContentCommand | null = info.menuItemId === 'ukw-highlight' ? 'highlight-selection' : info.menuItemId === 'ukw-note' ? 'add-note' : info.menuItemId === 'ukw-sidebar' ? 'toggle-sidebar' : null;
  if (command && tab?.id !== undefined) void chrome.tabs.sendMessage(tab.id, { ukw: 'command', command }).catch(() => undefined);
});
