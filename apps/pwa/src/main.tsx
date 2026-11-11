import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { openStore } from '@ukw/database';
import { uiCss } from '@ukw/ui';
import { App } from './App';
import { StoreProvider } from './store-context';
import './app.css';

async function boot() {
  const style = document.createElement('style');
  style.id = 'ukw-ui-css';
  style.textContent = uiCss();
  document.head.appendChild(style);

  const rootEl = document.getElementById('root')!;
  rootEl.className = 'ukw-root';
  let store;
  try {
    store = await openStore({ name: 'ukw' });
  } catch (err) {
    rootEl.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'boot-error';
    const h = document.createElement('h1');
    h.textContent = 'Local storage is unavailable';
    const p = document.createElement('p');
    p.textContent = 'This workspace keeps your data in your browser (IndexedDB). It looks blocked, for example in a private window or by a browser setting. Allow site data and reload.';
    const d = document.createElement('p');
    d.className = 'boot-error__detail';
    d.textContent = err instanceof Error ? err.message : String(err);
    box.append(h, p, d);
    rootEl.append(box);
    return;
  }
  createRoot(rootEl).render(
    <StrictMode>
      <StoreProvider store={store}>
        <HashRouter>
          <App />
        </HashRouter>
      </StoreProvider>
    </StrictMode>,
  );
}

void boot();
