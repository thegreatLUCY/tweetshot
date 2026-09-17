#!/usr/bin/env bash
# Regenerate the extension icon set from one square source image.
#
#   npm run icons -- ~/Downloads/tweetshot-icon.png
#
# Produces icons/icon128.png (store listing + toolbar), icon48.png and icon16.png.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SRC="${1:-}"
if [ -z "$SRC" ]; then
  echo "usage: npm run icons -- <square-source.png>" >&2
  exit 1
fi
[ -f "$SRC" ] || { echo "✗ not found: $SRC" >&2; exit 1; }

if ! command -v sips >/dev/null 2>&1; then
  echo "✗ sips not found (macOS only). Resize to 128/48/16 px manually." >&2
  exit 1
fi

W="$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/{print $2}')"
H="$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/{print $2}')"
if [ "$W" != "$H" ]; then
  echo "✗ source must be square — got ${W}×${H}." >&2
  echo "  Re-ask ChatGPT for a 1:1 square icon, or crop it square first." >&2
  exit 1
fi
if [ "$W" -lt 128 ]; then
  echo "✗ source is only ${W}px — supply at least 1024px so the 128px stays sharp." >&2
  exit 1
fi

mkdir -p icons
for s in 128 48 16; do
  sips -z "$s" "$s" "$SRC" --out "icons/icon${s}.png" >/dev/null
done

echo "✓ icons written from ${SRC##*/} (${W}×${H})"
ls -l icons/icon16.png icons/icon48.png icons/icon128.png | awk '{print "   " $NF " — " $5 " bytes"}'

echo
echo "Tip: open icons/icon16.png and zoom in. If you cannot tell what it is at"
echo "16px, the icon is too detailed — ask ChatGPT for a bolder, simpler shape."
echo
echo "Next: npm run build   (regenerates dist/tweetshot-<version>.zip with the new icon)"
