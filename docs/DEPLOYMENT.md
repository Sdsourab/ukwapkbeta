# Deployment guide

## 1. The PWA (static hosting)
`npm run build:pwa` produces `apps/pwa/dist`: plain static files. Any static host works (Netlify, Cloudflare Pages, Vercel, GitHub Pages, S3+CDN).

- **HTTPS is required** for service workers and installation (except on `localhost`).
- Routing uses the URL hash, so no SPA rewrite rules are needed, and the app works under a sub-path (`base: './'`).
- `apps/pwa/public/_headers` contains the recommended headers (CSP including `frame-ancestors`, `nosniff`, `no-referrer`,
  no-cache for `sw.js`/`index.html`/manifest, immutable caching for hashed assets). Netlify and Cloudflare Pages read that
  file automatically; on other hosts copy the values into the host's header configuration.
- The same CSP is also in a `<meta>` tag, but browsers ignore `frame-ancestors` there: set the real header.
- Updates: a new build changes `sw.js`; open tabs show "A new version is ready" and reload on request.

**Verify after deploying:** open the site, install it, switch to airplane mode, relaunch: the shell must load and your data must be present (see the manual checklist).

## 2. Optional cloud sync (Supabase)
Cloud sync is optional and **off by default**; nothing leaves the device without it. Follow `cloud/supabase/README.md`.
Status: the SQL and transport exist, but a sign-in screen has not been built, so end users cannot enable sync yet.

## 3. The Chrome extension
1. Bump `apps/extension/public/manifest.json` `version` (and keep it in step with `package.json`).
2. `npm run verify && npm run package:extension`.
3. Upload `release/ukw-extension-<version>.zip` to the Chrome Web Store developer dashboard.

Store listing notes you will need:
- **Single purpose:** annotate and organise content on web pages and AI chats.
- **Permission justification:** `contextMenus` (right-click highlight), `unlimitedStorage` (keep a large local library from being evicted), and access to http(s) pages (content script restores highlights and shows the toolbar). No data is collected or transmitted unless the user enables sync.
- **Remote code:** none. The verifier fails the build if remote scripts or `importScripts` appear.
- **Privacy policy:** state that pages visited are never recorded; annotations are stored locally; optional sync uses the user's own Supabase project.
- Replace the placeholder icons and add store screenshots before submitting.

## 4. Release checklist
`npm run verify` → manual browser checklist → bump versions → tag → publish. Record the result in `SESSION_LOG.md`.
