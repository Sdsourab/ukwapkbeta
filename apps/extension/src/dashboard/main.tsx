import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { openStore } from '@ukw/database';
import { uiCss } from '@ukw/ui';
import { App } from '../../../pwa/src/App';
import { StoreProvider } from '../../../pwa/src/store-context';
import '../../../pwa/src/app.css';

/**
 * The dashboard is the PWA's React app running on the extension's own origin and over the SAME database
 * the background worker uses ('ukw-ext'), so it always shows what the page annotator saved (ADR-008).
 * Changes are shared with the worker and open tabs through BroadcastChannel.
 */
async function boot() {
  const style = document.createElement('style');
  style.textContent = uiCss();
  document.head.appendChild(style);
  const rootEl = document.getElementById('root')!;
  rootEl.className = 'ukw-root';
  try {
    const store = await openStore({ name: 'ukw-ext' });
    createRoot(rootEl).render(
      <StrictMode>
        <StoreProvider store={store}>
          <HashRouter>
            <App />
          </HashRouter>
        </StoreProvider>
      </StrictMode>,
    );
  } catch (err) {
    rootEl.textContent = '';
    const p = document.createElement('p');
    p.style.cssText = 'padding:24px;font-family:system-ui';
    p.textContent = `Could not open local storage: ${err instanceof Error ? err.message : String(err)}`;
    rootEl.append(p);
  }
}
void boot();
