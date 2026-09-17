#!/usr/bin/env bash
# Capture Chrome Web Store screenshots at exactly 1280×800.
#
#   npm run shots                                  # uses the bundled demo image
#   TXE_SHOT_IMAGE=/test/harness/my-photo.jpg npm run shots
#
# Writes store/screenshots/NN-name.png and verifies every file's dimensions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${TXE_SHOT_PORT:-8792}"
SESSION="txe-shots"
OUT="store/screenshots"
IMG="${TXE_SHOT_IMAGE:-/test/harness/shot-source.png}"
W=1280
H=800

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if ! command -v playwright-cli >/dev/null 2>&1; then
  echo "playwright-cli not found — install it globally, then re-run" >&2
  exit 1
fi

SERVER_PID=""
cleanup() {
  playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

say "Serving on :$PORT"
python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1

mkdir -p "$OUT"
rm -f "$OUT"/*.png

playwright-cli -s="$SESSION" open about:blank >/dev/null 2>&1
playwright-cli -s="$SESSION" resize "$W" "$H" >/dev/null 2>&1

URL="http://127.0.0.1:$PORT/test/harness/store.html?img=$IMG"

shoot() {
  local name="$1"
  say "Capturing $name"
  playwright-cli -s="$SESSION" goto "$URL" >/dev/null 2>&1
  playwright-cli -s="$SESSION" resize "$W" "$H" >/dev/null 2>&1
  playwright-cli -s="$SESSION" --raw run-code --filename="$ROOT/test/harness/shots/$name.js" >/dev/null 2>&1
  playwright-cli -s="$SESSION" screenshot --filename="$OUT/${name}.png" >/dev/null 2>&1
}

for f in "$ROOT"/test/harness/shots/*.js; do
  shoot "$(basename "$f" .js)"
done

say "Verifying dimensions"
node - "$OUT" "$W" "$H" <<'NODE'
const fs = require('fs');
const path = require('path');
const [dir, w, h] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
if (!files.length) { console.error('✗ no screenshots produced'); process.exit(1); }
let bad = 0;
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const dim = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  const ok = dim.w === Number(w) && dim.h === Number(h);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${f} — ${dim.w}×${dim.h}`);
}
if (bad) { console.error(`✗ ${bad} screenshot(s) are not ${w}×${h}`); process.exit(1); }
console.log(`\n✓ ${files.length} screenshots at ${w}×${h} in ${dir}/`);
NODE
