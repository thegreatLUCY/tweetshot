#!/usr/bin/env bash
# End-to-end smoke test for the content script (the part unit tests can't reach).
#
#   npm run test:browser
#
# Boots a fake X composer, injects lib/* + content/content.js and drives every
# entry point: toolbar picker, native attach, Edit badge, and an invalidated
# extension context. Requires playwright-cli on PATH; skips cleanly if absent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${TXE_TEST_PORT:-8791}"
SESSION="${TXE_TEST_SESSION:-txe-smoke}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
pass() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

if ! command -v playwright-cli >/dev/null 2>&1; then
  echo "playwright-cli not found — skipping browser smoke test"
  exit 0
fi

if [ "$PORT" != "8791" ]; then
  fail "the drive scripts hardcode port 8791; set TXE_TEST_PORT=8791"
fi

SERVER_PID=""
cleanup() {
  playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

say "Starting static server on :$PORT"
SERVE="${TXE_TEST_ROOT:-$ROOT}"
python3 -m http.server "$PORT" --directory "$SERVE" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1

playwright-cli -s="$SESSION" open about:blank >/dev/null 2>&1 || fail "could not start a browser"

run_case() {
  local name="$1" script="$2" out
  say "$name"
  set +e
  out="$(playwright-cli -s="$SESSION" --raw run-code --filename="$script" 2>&1 | tail -3)"
  set -e
  if printf '%s' "$out" | grep -q '"opened":true'; then
    pass "$(printf '%s' "$out" | grep '"opened":true' | tail -1)"
  else
    fail "$out"
  fi
}

run_case "Toolbar picker opens the editor" "$ROOT/test/harness/drive-picker.js"
run_case "Native attach is intercepted"    "$ROOT/test/harness/drive-native.js"
run_case "Edit badge opens the editor"     "$ROOT/test/harness/drive-badge.js"
run_case "Multi-image batch steps to the next file" "$ROOT/test/harness/drive-batch.js"
run_case "Every tool edits and undo restores"      "$ROOT/test/harness/drive-tools.js"
run_case "Use in tweet attaches (native input)"    "$ROOT/test/harness/drive-inject.js"
run_case "Use in tweet attaches (hoisted input)"   "$ROOT/test/harness/drive-inject-portal.js"
run_case "Star ask appears once, never again"   "$ROOT/test/harness/drive-star-nudge.js"
run_case "Survives an invalidated context"         "$ROOT/test/harness/drive-broken-context.js"

say "All browser smoke tests passed"
