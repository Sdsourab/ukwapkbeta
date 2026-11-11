# 13 — Development & Deployment

## 13.1 Prerequisites

- Git.
- Node.js LTS.
- A code editor.
- A Chromium-based browser for extension testing.
- Optional Supabase project for cloud phase.
- Optional Android device for PWA testing.

## 13.2 Local development

Recommended scripts (adapt to chosen build tooling):

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

## 13.3 Extension build

1. Build the extension app.
2. Confirm Manifest V3 output.
3. Inspect requested permissions.
4. Load the build folder through browser extension developer mode.
5. Test on controlled fixture pages.
6. Test on each supported website adapter.
7. Package only production build files.

Never put development secrets or local test data in the release package.

## 13.4 PWA deployment

1. Build static PWA assets.
2. Configure correct base path for the hosting provider.
3. Test service worker scope.
4. Test installability.
5. Test offline fallback.
6. Verify authentication redirect URLs.
7. Test on Android Chrome and desktop browsers.

Static hosting providers and free quotas can change. Verify current terms before relying on a free tier for a public product.

## 13.5 Database deployment

- Apply schema migrations.
- Enable RLS.
- Test policies using separate accounts.
- Create indexes based on expected queries.
- Configure backup/export procedures.
- Keep provider secrets in protected environment settings.
- Test schema rollback or recovery plan.

## 13.6 Environment variables

Example names only:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

A public anonymous client key is not a substitute for RLS. Never expose service-role or database-owner credentials in client builds.

## 13.7 Release checklist

- [ ] Version number updated.
- [ ] Changelog updated.
- [ ] Tests pass.
- [ ] Typecheck and lint pass.
- [ ] Permissions reviewed.
- [ ] Database migration reviewed.
- [ ] RLS verified.
- [ ] Backup/restore verified.
- [ ] Extension loaded in clean browser profile.
- [ ] PWA tested on mobile.
- [ ] Known issues updated.
- [ ] Rollback plan prepared.

## 13.8 Versioning

Use semantic versioning when public releases begin:
- MAJOR: incompatible data/API change.
- MINOR: backward-compatible feature.
- PATCH: bug fix.

Data schema version is separate from application version.
