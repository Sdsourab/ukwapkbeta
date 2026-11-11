import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Cloud sync (optional) talks to the user's own Supabase project only.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const STATIC_ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'share.html', 'share.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

/** Production-only CSP (the dev server needs inline scripts for HMR). */
function cspPlugin(): Plugin {
  return {
    name: 'ukw-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

/** Emits a small offline-first service worker precaching every build asset. */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'ukw-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const assets = [...new Set([...STATIC_ASSETS, ...built])];
      const version = createHash('sha1').update(assets.join('|')).update(built.map((f) => ('code' in bundle[f]! ? (bundle[f] as { code: string }).code.length : 0)).join(',')).digest('hex').slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `/* Generated at build time. Offline-first app shell. */
const CACHE = 'ukw-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ukw-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin (sync) traffic
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(url.pathname.endsWith('share.html') ? 'share.html' : 'index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`,
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin(), serviceWorkerPlugin()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
