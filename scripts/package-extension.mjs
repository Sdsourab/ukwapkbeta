// Zips apps/extension/dist into release/ukw-extension-<version>.zip (needs python3 for zipfile).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/extension/dist');
if (!fs.existsSync(path.join(dist, 'manifest.json'))) { console.error('Build first: npm run build:extension'); process.exit(1); }
const version = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8')).version;
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
const zip = path.join(root, 'release', `ukw-extension-${version}.zip`);
fs.rmSync(zip, { force: true });
const py = `import sys,os,zipfile
src,dst=sys.argv[1],sys.argv[2]
with zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED) as z:
    for d,_,fs_ in os.walk(src):
        for f in sorted(fs_):
            p=os.path.join(d,f); z.write(p, os.path.relpath(p,src))
`;
const r = spawnSync('python3', ['-c', py, dist, zip], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`created ${path.relative(root, zip)} (${Math.round(fs.statSync(zip).size / 1024)} kB)`);
