#!/usr/bin/env bash
# Prove the packaged artifact works: build, drop the browser harness into the
# staged copy, run the full suite against it, then clean up.
#
#   npm run test:artifact
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash scripts/build.sh
VERSION="$(node -p "require('./manifest.json').version")"
STAGE="dist/tweetshot-${VERSION}"

printf '\n\033[1mTesting the packaged build\033[0m\n'
mkdir -p "$STAGE/test"
cp -r test/harness "$STAGE/test/harness"

set +e
TXE_TEST_ROOT="$STAGE" TXE_TEST_SESSION=txe-artifact bash test/harness/run.sh
STATUS=$?
set -e

rm -rf "$STAGE/test"
exit $STATUS
