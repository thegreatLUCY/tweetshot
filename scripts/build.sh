#!/usr/bin/env bash
# Package the extension for the Chrome Web Store.
#
#   npm run build
#
# Runs the preflight checks, stages only the files the store should receive,
# and writes dist/tweetshot-<version>.zip with manifest.json at the zip root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

say "Preflight"
node scripts/preflight.mjs

VERSION="$(node -p "require('./manifest.json').version")"
ZIP="dist/tweetshot-${VERSION}.zip"
STAGE="dist/tweetshot-${VERSION}"

say "Staging v${VERSION}"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE/lib" "$STAGE/content" "$STAGE/editor" "$STAGE/popup" "$STAGE/icons" "$STAGE/fonts" "$STAGE/_locales/en"

cp manifest.json background.js "$STAGE/"
cp lib/editor-core.js lib/editor-ui.js lib/editor-ui.css "$STAGE/lib/"
cp content/content.js "$STAGE/content/"
cp editor/editor.html editor/editor.css editor/editor.js "$STAGE/editor/"
cp popup/popup.html popup/popup.js "$STAGE/popup/"
cp icons/icon16.png icons/icon48.png icons/icon128.png "$STAGE/icons/"
cp fonts/*.woff2 fonts/LICENSE.txt "$STAGE/fonts/"
cp _locales/en/messages.json "$STAGE/_locales/en/"

say "Zipping"
( cd "$STAGE" && zip -X -r -q "../tweetshot-${VERSION}.zip" . -x '*.DS_Store' )

# manifest.json must sit at the root of the archive (not in a subfolder).
# Plain string matching: piping into `grep -q` would SIGPIPE unzip and trip pipefail.
NAMES="$(unzip -Z1 "$ZIP")"
case $'\n'"$NAMES"$'\n' in
  *$'\nmanifest.json\n'*) : ;;
  *)
    echo "✗ manifest.json is not at the zip root" >&2
    exit 1
    ;;
esac

SIZE="$(du -h "$ZIP" | cut -f1)"
COUNT="$(unzip -l "$ZIP" | tail -1 | awk '{print $2}')"

printf '\n\033[32m✓ Built %s (%s files, %s)\033[0m\n' "$ZIP" "$COUNT" "$SIZE"
printf '\nUpload this file at https://chrome.google.com/webstore/devconsole\n'
printf 'Staged copy kept at %s/ for inspection.\n' "$STAGE"
