# Installation guide

## Requirements
- Node.js 22 (Vite 8 needs 20.19+ or 22.12+) and npm.
- Google Chrome (or another Chromium browser) 111+ for the extension. The CSS Custom Highlight API (Chrome 105+) draws highlights; an overlay fallback exists for engines without it.
- `python3` only for `npm run package:extension` (zip creation).

## Install and verify
```bash
npm install
npm run verify      # typecheck, builds, static extension verification, every test
```
`npm run verify` should end with all tests passing and "OK: all static checks passed".

## Run the PWA locally
```bash
npm run dev         # http://localhost:5173
```
To test installation and offline behaviour use a production build, because the service worker is only generated for builds:
```bash
npm run build:pwa
npx vite preview --config apps/pwa/vite.config.ts --port 4173   # then open http://localhost:4173
```
Browsers allow installing a PWA from `localhost` or any HTTPS origin.

## Install the extension (unpacked)
1. `npm run build:extension` (output: `apps/extension/dist`).
2. Open `chrome://extensions`, switch on **Developer mode**.
3. **Load unpacked** → choose `apps/extension/dist`.
4. The library opens on first install. Pin the toolbar button for quick access.
5. Reload already-open tabs once (content scripts attach on page load).

After any rebuild, click the reload icon on the extension card, then reload the pages you are testing.

## Make a distributable zip
```bash
npm run build:extension && npm run package:extension    # → release/ukw-extension-0.1.0.zip
```

## Keyboard shortcuts (extension)
| Action | Default | Notes |
|---|---|---|
| Highlight selection | `Alt+H` | Also a browser command, rebindable at `chrome://extensions/shortcuts` |
| Open/close sidebar | `Alt+S` | " |
| Highlight + note | `Alt+N` | " |
| Bookmark this spot | `Alt+B` | " |
| Command palette | `Alt+K` | In-page; `Ctrl/⌘+K` is used in the library and PWA |

Shortcuts are ignored while you type in a page's own input fields.

## Troubleshooting
- *Toolbar button says "Reload this page":* the tab was open before the extension started; reload it.
- *"This kind of page cannot be annotated":* browser pages, the Web Store and local files are off limits.
- *Highlights show "Location lost":* the page text changed. Use **Reattach** in the sidebar.
- *Everything looks unstyled in the dashboard:* rebuild and reload the extension.
