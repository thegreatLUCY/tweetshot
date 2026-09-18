#!/usr/bin/env node
/**
 * Cut a release for the Chrome Web Store.
 *
 *   npm run release -- 1.2.0          bump, verify, build
 *   npm run release -- --check 1.2.0  validate the version only, change nothing
 *   npm run release -- 1.2.0 --fast   skip the packaged-browser test
 *
 * Chrome takes the version from `manifest.json` inside the uploaded zip — there
 * is nowhere in the dashboard to type it. This bumps every copy, runs the gates,
 * and tells you exactly where to upload.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const fast = argv.includes('--fast');
const next = argv.find((a) => !a.startsWith('--'));

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

if (!next) {
  console.error(`
Usage: npm run release -- <version>

  npm run release -- 1.2.0          bump, verify and build
  npm run release -- --check 1.2.0  validate only, change nothing
  npm run release -- 1.2.0 --fast   skip the packaged-browser test

Chrome reads the version from manifest.json inside the uploaded zip.
`);
  process.exit(1);
}

/* ------------------------------------------------------------ validate */

const VERSION_FILES = ['manifest.json', 'manifest.firefox.json', 'package.json'];
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const current = readJson('manifest.json').version;

const parts = next.split('.');
const invalidFormat =
  parts.length < 1 ||
  parts.length > 4 ||
  parts.some((p) => !/^\d+$/.test(p) || Number(p) > 65535);

if (invalidFormat) {
  console.error(red(`✗ "${next}" is not a valid extension version.`));
  console.error('  Use 1 to 4 dot-separated integers, 0-65535 — e.g. 1.2.0. Letters are not allowed.');
  process.exit(1);
}

const cmp = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
};

if (cmp(next, current) <= 0) {
  console.error(red(`✗ ${next} is not greater than the current ${current}.`));
  console.error('  The store rejects a version it has already seen, so it must always increase.');
  process.exit(1);
}

console.log(`\n${bold('TweetShot release')}\n`);
console.log(`  current   ${current}`);
console.log(`  new       ${next}  ${green('✓ valid, and greater than current')}\n`);

if (checkOnly) {
  console.log(dim('  --check: nothing was written.\n'));
  process.exit(0);
}

/* --------------------------------------------------------------- bump */

const backups = new Map();
const write = (file, contents) => {
  if (!backups.has(file)) backups.set(file, readFileSync(file, 'utf8'));
  writeFileSync(file, contents);
};

const sleep = (ms) => execSync(`sleep ${ms / 1000}`);
for (const f of VERSION_FILES) {
  const json = readJson(f);
  json.version = next;
  write(f, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ${green('updated')}  ${f}`);
}

// keep the docs honest about which version they describe
const swapVersion = (file, from, patterns) => {
  let s = readFileSync(file, 'utf8');
  let touched = false;
  for (const re of patterns) {
    if (re.test(s)) {
      s = s.replace(re, (m) => m.replace(from, next));
      touched = true;
    }
  }
  if (touched) {
    write(file, s);
    console.log(`  ${green('updated')}  ${file}`);
  }
};
swapVersion('README.md', current, [/img\.shields\.io\/badge\/version-[0-9.]+/]);
swapVersion('STORE_LISTING.md', current, [
  /manifest\.json` v[0-9.]+/,
  /dist\/tweetshot-[0-9.]+\.zip/g,
]);
console.log();

/* -------------------------------------------------------------- gates */

const gates = [
  ['lint', 'npm run lint', 'syntax-check every script'],
  ['unit tests', 'npm test', 'canvas engine + tooling'],
  ['preflight', 'npm run preflight', 'Chrome Web Store blockers'],
  ['packaged build', 'npm run test:artifact', 'build + browser suite against the zip'],
];

const results = [];
let failed = null;

for (const [name, cmd, what] of gates) {
  if (fast && name === 'packaged build') {
    results.push([name, 'skipped']);
    continue;
  }
  process.stdout.write(`  ${name.padEnd(16)}`);
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(green('passed'));
    results.push([name, 'passed']);
  } catch (err) {
    console.log(red('FAILED'));
    failed = { name, cmd, out: `${err.stdout || ''}${err.stderr || ''}` };
    results.push([name, 'failed']);
    break;
  }
  void what;
}

if (failed) {
  console.log(`\n${red(`✗ ${failed.name} failed — rolling the version back.`)}\n`);
  for (const [file, contents] of backups) writeFileSync(file, contents);
  console.log(failed.out.split('\n').slice(-25).join('\n'));
  process.exit(1);
}

/* --------------------------------------------------------------- done */

const zip = `dist/tweetshot-${next}.zip`;
if (!existsSync(zip)) {
  console.error(red(`\n✗ expected ${zip} but it was not produced.`));
  process.exit(1);
}

console.log(`\n${green(`✓ ${zip}`)}\n`);
console.log(`${bold('Where to upload it')}

  1. Open https://chrome.google.com/webstore/devconsole
  2. Select TweetShot  ->  ${bold('Package')} in the left sidebar
  3. Click ${bold('Upload new package')} and choose ${zip}
  4. Click ${bold('Submit for review')}  ${dim('(uploading alone does not publish)')}

  Review is usually hours to a few days.
  The store listing (screenshots, descriptions) is separate and updates on
  its own tab — no new package needed for copy or image changes.

${bold('Before you upload')}  confirm the version shown on the Package tab is lower
than ${next}, otherwise the upload is rejected as already-used.
`);
