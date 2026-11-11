// Builds the extension into ./dist: background (ES module), content script (single IIFE), dashboard + popup pages.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const define = { 'process.env.NODE_ENV': '"production"' };
const base = { configFile: false, logLevel: 'warn', root, define, plugins: [react()] };
const out = { outDir: dist, emptyOutDir: false, sourcemap: false, target: 'chrome111', chunkSizeWarningLimit: 1500 };

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

await build({ ...base, build: { ...out, lib: { entry: path.join(root, 'src/background/index.ts'), formats: ['es'], fileName: () => 'background.js' } } });
await build({ ...base, build: { ...out, lib: { entry: path.join(root, 'src/content/index.ts'), formats: ['iife'], name: 'ukwContent', fileName: () => 'content.js' } } });
await build({ ...base, base: './', build: { ...out, rollupOptions: { input: { dashboard: path.join(root, 'dashboard.html'), popup: path.join(root, 'popup.html') } } } });

fs.copyFileSync(path.join(root, 'public/manifest.json'), path.join(dist, 'manifest.json'));
fs.cpSync(path.join(root, 'public/icons'), path.join(dist, 'icons'), { recursive: true });

const size = (f) => (fs.statSync(path.join(dist, f)).size / 1024).toFixed(0) + ' kB';
console.log(`extension built → ${path.relative(process.cwd(), dist) || dist}`);
for (const f of ['background.js', 'content.js']) console.log(`  ${f}  ${size(f)}`);
