// Static verification of apps/extension/dist. Fails (exit 1) on any problem. No browser needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/extension/dist');
const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const exists = (rel) => fs.existsSync(path.join(dist, rel.split('#')[0]));
const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');

if (!fs.existsSync(dist)) { console.error('dist not found. Run `npm run build:extension` first.'); process.exit(1); }
const manifestPath = path.join(dist, 'manifest.json');
if (!fs.existsSync(manifestPath)) { console.error('manifest.json missing'); process.exit(1); }
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// --- manifest structure
if (m.manifest_version !== 3) fail('manifest_version must be 3');
for (const k of ['name', 'version', 'description']) if (!m[k]) fail(`manifest.${k} missing`);
if (!/^\d+(\.\d+){0,3}$/.test(m.version ?? '')) fail('version must be dotted integers');
if ((m.description ?? '').length > 132) fail('description exceeds the 132 character store limit');

// --- every referenced file exists
const refs = new Set();
if (m.background?.service_worker) refs.add(m.background.service_worker);
for (const cs of m.content_scripts ?? []) { (cs.js ?? []).forEach((f) => refs.add(f)); (cs.css ?? []).forEach((f) => refs.add(f)); }
if (m.action?.default_popup) refs.add(m.action.default_popup);
if (m.options_ui?.page) refs.add(m.options_ui.page);
Object.values(m.icons ?? {}).forEach((f) => refs.add(f));
Object.values(m.action?.default_icon ?? {}).forEach((f) => refs.add(f));
for (const r of refs) if (!exists(r)) fail(`referenced file missing: ${r}`);

// --- permissions are minimal and explicit (changing this list is a security-relevant decision: update docs/12 too)
const ALLOWED_PERMS = new Set(['contextMenus', 'unlimitedStorage']);
for (const p of m.permissions ?? []) if (!ALLOWED_PERMS.has(p)) fail(`unexpected permission: ${p}`);
if (m.host_permissions?.length) fail('host_permissions must be empty (content-script matches are the only site access)');
if (m.optional_permissions?.length) notes.push(`optional_permissions: ${m.optional_permissions.join(', ')}`);
for (const cs of m.content_scripts ?? []) for (const pat of cs.matches ?? []) if (!/^https?:\/\/\*\/\*$/.test(pat)) fail(`content script match is not plain http(s): ${pat}`);
if (!/script-src 'self'/.test(m.content_security_policy?.extension_pages ?? '')) fail("extension_pages CSP must contain script-src 'self'");
if (/unsafe-eval|unsafe-inline|https?:/.test(m.content_security_policy?.extension_pages ?? '')) fail('extension_pages CSP must not allow eval, inline script or remote origins');
if (m.web_accessible_resources?.length) notes.push('web_accessible_resources present: review fingerprinting exposure');

// --- commands correspond to commands the content script understands
const domainSrc = fs.readFileSync(path.join(root, 'packages/domain/src/messages.ts'), 'utf8');
const known = new Set([...(domainSrc.match(/CONTENT_COMMANDS = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]));
for (const c of Object.keys(m.commands ?? {})) if (!known.has(c)) fail(`command "${c}" is not a known content command`);
if (Object.values(m.commands ?? {}).filter((c) => c.suggested_key).length > 4) fail('Chrome allows at most 4 suggested shortcuts');

// --- bundles: shape and remote-code checks
const content = read('content.js');
const bg = read('background.js');
if (/^\s*(import|export)\s[^;]*from\s/m.test(content) || /^\s*export\s/m.test(content)) fail('content.js must be a self-contained script (no ES import/export)');
if (/\bimport\s*\(\s*["'`]https?:/.test(content + bg)) fail('remote dynamic import found');
if (/\bimportScripts\s*\(/.test(bg)) fail('importScripts found in the service worker');
if (/^\s*import\s[^;]*from\s["']https?:/m.test(bg)) fail('service worker imports a remote module');
if (!/chrome\.runtime\.onMessage\.addListener/.test(bg)) fail('service worker does not register onMessage at top level');
for (const html of ['dashboard.html', 'popup.html']) {
  const src = read(html);
  for (const mm of src.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) {
    if (/^(https?:)?\/\//.test(mm[1])) fail(`${html} loads a remote script: ${mm[1]}`);
    else if (!exists(mm[1].replace(/^\.\//, ''))) fail(`${html} references a missing script: ${mm[1]}`);
  }
  if (/<script(?![^>]*\ssrc=)[^>]*>[^<]/.test(src)) fail(`${html} contains an inline script (blocked by the extension CSP)`);
  for (const mm of src.matchAll(/(?:href|src)=["']([^"']+\.(?:css|js))["']/g)) if (!/^(https?:)?\/\//.test(mm[1]) && !exists(mm[1].replace(/^\.\//, ''))) fail(`${html} references a missing asset: ${mm[1]}`);
}
const evalHits = (content.match(/\beval\s*\(/g) ?? []).length + (bg.match(/\beval\s*\(/g) ?? []).length;
if (evalHits) notes.push(`${evalHits} eval( occurrence(s) in bundled third-party code (inspect if the store review flags them)`);

// --- size budgets (informational thresholds, tune as the product grows)
const kb = (f) => Math.round(fs.statSync(path.join(dist, f)).size / 1024);
if (kb('content.js') > 700) fail(`content.js is ${kb('content.js')} kB (budget 700 kB)`);
if (kb('background.js') > 700) fail(`background.js is ${kb('background.js')} kB (budget 700 kB)`);

console.log('Extension verification report');
console.log(`  name/version : ${m.name} ${m.version}`);
console.log(`  permissions  : ${(m.permissions ?? []).join(', ') || 'none'}   host_permissions: ${(m.host_permissions ?? []).join(', ') || 'none'}`);
console.log(`  site access  : ${(m.content_scripts ?? []).flatMap((c) => c.matches).join(', ')}`);
console.log(`  bundles      : background.js ${kb('background.js')} kB, content.js ${kb('content.js')} kB`);
console.log(`  files checked: ${refs.size} referenced`);
for (const n of notes) console.log(`  note         : ${n}`);
if (problems.length) { console.error('\nFAILED:'); for (const p of problems) console.error('  ✗ ' + p); process.exit(1); }
console.log('\nOK: all static checks passed (this does NOT replace loading the extension in Chrome).');
