#!/usr/bin/env node
/**
 * Chrome Web Store preflight.
 *
 * Catches the things that get an extension rejected or silently break for
 * users: bad manifest, missing referenced files, oversized name/description,
 * remote code, wrong icon sizes, and dev-only files leaking into the zip.
 *
 * Usage: npm run preflight
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

const fail = (m) => problems.push(m);
const ok = (m) => notes.push(m);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

/* ------------------------------------------------------------ the manifest */

if (!existsSync(join(ROOT, 'manifest.json'))) {
  console.error('✗ manifest.json is missing');
  process.exit(1);
}
const m = readJson('manifest.json');

if (m.manifest_version !== 3) fail('manifest_version must be 3');
if (!/^\d+(\.\d+){0,3}$/.test(m.version)) fail(`version "${m.version}" is not a valid extension version`);
if (!m.default_locale) fail('default_locale is required when using __MSG_ placeholders');

/* resolve __MSG_ placeholders the way Chrome would */
const localeDir = `_locales/${m.default_locale || 'en'}`;
if (m.default_locale && !existsSync(join(ROOT, localeDir, 'messages.json'))) {
  fail(`missing ${localeDir}/messages.json`);
}
const messages = m.default_locale ? readJson(`${localeDir}/messages.json`) : {};
const resolveMsg = (v) => {
  const match = /^__MSG_(.+)__$/.exec(v || '');
  if (!match) return v || '';
  const key = match[1];
  if (!messages[key]) {
    fail(`manifest references __MSG_${key}__ but it is not in ${localeDir}/messages.json`);
    return '';
  }
  return messages[key].message;
};

const name = resolveMsg(m.name);
const description = resolveMsg(m.description);
if (!name) fail('manifest name is empty');
if (name.length > 45) fail(`name is ${name.length} chars (Chrome Web Store limit is 45)`);
if (!description) fail('manifest description is empty');
if (description.length > 132) fail(`description is ${description.length} chars (limit is 132)`);
ok(`name "${name}" (${name.length}/45), description ${description.length}/132`);

const has = (p) => existsSync(join(ROOT, p));

/* ------------------------------------------------- every referenced file exists */

const referenced = new Set();
const add = (p) => p && referenced.add(p);

add(m.background?.service_worker);
add(m.action?.default_popup);
for (const p of Object.values(m.icons || {})) add(p);
for (const p of Object.values(m.action?.default_icon || {})) add(p);
for (const cs of m.content_scripts || []) {
  (cs.js || []).forEach(add);
  (cs.css || []).forEach(add);
}
for (const war of m.web_accessible_resources || []) {
  for (const r of war.resources || []) {
    if (r.includes('*')) {
      const dir = dirname(r);
      const ext = r.slice(r.lastIndexOf('.'));
      const files = has(dir) ? readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(ext)) : [];
      if (!files.length) fail(`web_accessible_resources glob "${r}" matches nothing`);
    } else {
      add(r);
    }
  }
}
for (const p of referenced) if (!has(p)) fail(`manifest references a missing file: ${p}`);
ok(`${referenced.size} manifest-referenced files present`);

/* --------------------------------------------------------------- icon sizes */

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
for (const [size, path] of Object.entries(m.icons || {})) {
  if (!has(path)) continue;
  const dim = pngSize(readFileSync(join(ROOT, path)));
  if (!dim) fail(`${path} is not a PNG`);
  else if (dim.w !== Number(size) || dim.h !== Number(size)) {
    fail(`${path} is ${dim.w}×${dim.h} but declared as ${size}×${size}`);
  }
}
const storeIcon = m.icons?.['128'];
if (!storeIcon) fail('icons.128 is required for the store listing');
ok('icon sizes match their declared dimensions');

/* ------------------------------------------------------------- remote code */

const shipJs = [...referenced].filter((f) => f.endsWith('.js'));
const banned = [
  [/eval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function()'],
  [/document\.write\s*\(/, 'document.write()'],
  [/import\s*\(\s*['"`]https?:/, 'dynamic import of a remote module'],
];
for (const f of shipJs) {
  const src = read(f);
  for (const [re, label] of banned) if (re.test(src)) fail(`${f} uses ${label} (MV3 forbids remote/dynamic code)`);
  if (/<script[^>]+src=["']https?:/i.test(src)) fail(`${f} loads a remote script`);
}
ok(`${shipJs.length} scripts checked for remote/dynamic code`);

/* ----------------------------------------------- no unexpected network hosts */

const allowedHosts = new Set();
for (const h of m.host_permissions || []) allowedHosts.add(h.replace(/\/\*$/, ''));
for (const cs of m.content_scripts || []) for (const u of cs.matches || []) allowedHosts.add(u.replace(/\/\*$/, ''));

const scan = [...referenced];
const hostRe = /https?:\/\/([a-z0-9.-]+)/gi;
const unexpected = new Set();
for (const f of scan) {
  if (!/\.(js|css|html|json)$/i.test(f)) continue;
  const src = read(f);
  for (const match of src.matchAll(hostRe)) {
    const host = match[1].toLowerCase();
    if (host === 'www.w3.org') continue; // svg/xml namespaces
    if (![...allowedHosts].some((a) => a.includes(host))) unexpected.add(`${host} (in ${f})`);
  }
}
if (unexpected.size) fail(`unexpected network hosts: ${[...unexpected].join(', ')}`);
ok('no network hosts beyond the declared matches');

/* ------------------------------------------------------ dev files stay out */

const DEV_ONLY = [
  'test/',
  'scripts/',
  'manifest.firefox.json',
  'package.json',
  'package-lock.json',
  'README.md',
  'STORE_LISTING.md',
  'PRIVACY.md',
  '.playwright-cli/',
];
for (const p of referenced) {
  if (DEV_ONLY.some((d) => p === d || p.startsWith(d))) fail(`dev-only file would ship: ${p}`);
}

/* fonts must be real payloads, not placeholders */
for (const dir of ['fonts']) {
  if (!has(dir)) continue;
  const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.woff2'));
  if (!files.length) fail('fonts/ has no .woff2 files');
  for (const f of files) {
    if (statSync(join(ROOT, dir, f)).size < 2000) fail(`fonts/${f} looks like a placeholder`);
  }
  ok(`${files.length} bundled font files`);
}

/* ------------------------------------------------------------------ report */

for (const n of notes) console.log(`  ✓ ${n}`);
if (problems.length) {
  console.error('\n✗ Preflight failed:');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log('\n✓ Preflight passed — ready to package.');
console.log(`  Extension: ${name} v${m.version}`);
console.log(`  Permissions: ${(m.permissions || []).join(', ') || 'none'}`);
console.log(`  Hosts: ${(m.host_permissions || []).join(', ') || 'none'}`);
