/// <reference types="chrome" />
import { adapterFor } from './adapters';
import { createChromeClient } from './client';
import { PageController, type ControllerState } from './controller';
import { createRenderer } from './highlighter';

/**
 * Content script entry. Runs only in the top frame of http(s) pages. It is inert until it has something
 * to show: the UI bundle is mounted lazily the first time there are highlights, a selection or a command.
 */
declare global { interface Window { __ukwLoaded?: boolean } }

function boot() {
  if (window.top !== window || !/^https?:$/.test(location.protocol) || window.__ukwLoaded) return;
  window.__ukwLoaded = true;

  const controller = new PageController({ doc: document, win: window, client: createChromeClient(), adapterFor, renderer: createRenderer(document) });

  let mounted = false;
  const needsUi = (s: ControllerState) => !s.disabled && (s.annotations.length > 0 || !!s.selection || s.sidebarOpen || s.paletteOpen || !!s.activeId);
  const mountIfNeeded = () => {
    if (mounted || !needsUi(controller.getState())) return;
    mounted = true;
    void import('./ui/mount').then(({ mountUi }) => mountUi(controller));
  };
  controller.subscribe(mountIfNeeded);

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false; // only our own extension may command us
    const result = controller.handleRuntimeMessage(raw);
    if (result !== undefined) sendResponse(result);
    return false;
  });

  void controller.start().then(mountIfNeeded);
}

boot();
