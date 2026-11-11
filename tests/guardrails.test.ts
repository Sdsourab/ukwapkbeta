// Repository-wide guardrails (docs/11 §11.6): these fail the build when a rule is broken by a future change.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
/** Removes // and /* *\/ comments so guards look at code, not prose (string contents are kept). */
const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const rel = (p: string) => path.relative(root, p).replace(/\\/g, '/');
const sourceFiles = () => [...walk(path.join(root, 'packages')), ...walk(path.join(root, 'apps'))].filter((f) => /\/src\/.*\.(ts|tsx)$/.test(f.replace(/\\/g, '/')) && !/\.test\.(ts|tsx)$/.test(f));
const distFiles = (app: string) => walk(path.join(root, 'apps', app, 'dist')).filter((f) => /\.(js|html|css|json|webmanifest)$/.test(f));

describe('no AI features or AI endpoints (this phase excludes them)', () => {
  const AI = [/api\.anthropic\.com/i, /api\.openai\.com/i, /generativelanguage\.googleapis\.com/i, /openrouter\.ai/i, /api\.deepseek\.com/i, /\/v1\/chat\/completions/i, /\bgpt-[0-9]/i, /claude-(?:sonnet|opus|haiku)/i];
  it('source contains none', () => {
    const hits = sourceFiles().flatMap((f) => AI.filter((re) => re.test(fs.readFileSync(f, 'utf8'))).map((re) => `${rel(f)} matches ${re}`));
    expect(hits).toEqual([]);
  });
  it('built assets contain none (when built)', () => {
    const hits = ['pwa', 'extension'].flatMap((app) => distFiles(app).flatMap((f) => AI.filter((re) => re.test(fs.readFileSync(f, 'utf8'))).map((re) => `${rel(f)} matches ${re}`)));
    expect(hits).toEqual([]);
  });
});

describe('no privileged keys or secrets ship to clients (TC-SEC)', () => {
  const SECRET = [/service_role/i, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, /\bsk-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/];
  it('source and built assets contain no JWTs, private keys or service-role references', () => {
    const files = [...sourceFiles(), ...distFiles('pwa'), ...distFiles('extension')];
    const hits = files.flatMap((f) => SECRET.filter((re) => re.test(fs.readFileSync(f, 'utf8'))).map((re) => `${rel(f)} matches ${re}`));
    expect(hits).toEqual([]);
  });
  it('the only mention of the service role is the warning in the SQL/docs, never in client code', () => {
    const sql = fs.readFileSync(path.join(root, 'cloud/supabase/schema.sql'), 'utf8');
    expect(/service-role|service_role/.test(sql)).toBe(true); // documented as "never ship it"
    expect(sourceFiles().filter((f) => /service[_-]?role/i.test(code(f))).map(rel)).toEqual([]); // comments may warn about it; code may not use it
  });
  it('.env files are ignored by git', () => {
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
  });
});

describe('untrusted text is never turned into HTML (TC-SEC: HTML note content is sanitised before rendering)', () => {
  it('innerHTML / dangerouslySetInnerHTML appear only in the audited places', () => {
    const hits = sourceFiles().filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();
    expect(hits).toEqual([
      'apps/extension/src/content/ui/Sidebar.tsx', // renders graphToSvg(): all text escaped, colours validated, covered by tests
      'apps/pwa/src/main.tsx', // clears the boot container before showing a static error (no data involved)
    ]);
  });
  it('no eval, Function constructor or string timers in first-party code', () => {
    const hits = sourceFiles().filter((f) => /\beval\s*\(|new Function\s*\(|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual([]);
  });
});

describe('local-first privacy: the only network code is the sync transport', () => {
  it('fetch / XHR / WebSocket / sendBeacon / EventSource are used nowhere else', () => {
    // `fetch` as an identifier (called directly or passed around), but not as an object key such as `cfg.fetch` or `fetch?:`.
    const NET = /(?<![.\w])fetch\b(?!\s*\??:)|XMLHttpRequest|new WebSocket|sendBeacon|new EventSource/;
    const hits = sourceFiles().filter((f) => NET.test(code(f))).map(rel).sort();
    expect(hits).toEqual(['packages/sync-engine/src/supabase-transport.ts']);
  });
  it('the sync transport only ever calls the configured Supabase project URL', () => {
    const src = fs.readFileSync(path.join(root, 'packages/sync-engine/src/supabase-transport.ts'), 'utf8');
    expect(src.match(/https?:\/\/[^\s'"`)]+/g) ?? []).toEqual(['https://<project>.supabase.co']); // only the doc comment
  });
  it('analytics/telemetry libraries are not dependencies', () => {
    const pkgs = [root, ...fs.readdirSync(path.join(root, 'packages')).map((d) => path.join(root, 'packages', d)), ...fs.readdirSync(path.join(root, 'apps')).map((d) => path.join(root, 'apps', d))];
    const deps = pkgs.flatMap((p) => { const f = path.join(p, 'package.json'); if (!fs.existsSync(f)) return []; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Object.keys({ ...j.dependencies, ...j.devDependencies }); });
    expect(deps.filter((d) => /sentry|segment|mixpanel|amplitude|posthog|google-analytics|gtag|datadog|logrocket|hotjar/i.test(d))).toEqual([]);
  });
});

describe('extension permissions stay minimal (docs/11 §11.8)', () => {
  it('the source manifest requests only contextMenus and unlimitedStorage and no host_permissions', () => {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'apps/extension/public/manifest.json'), 'utf8'));
    expect(m.permissions.sort()).toEqual(['contextMenus', 'unlimitedStorage']);
    expect(m.host_permissions ?? []).toEqual([]);
    expect(m.manifest_version).toBe(3);
  });
});
