# TweetShot — Image Editor for X/Twitter

Chrome/Edge (MV3) extension. Edit photos **inside the X.com composer**: blur or
pixelate, cover sensitive details, annotate, crop, straighten and enhance — then
one click to put the result back in the tweet.

Everything runs locally on `<canvas>`. No uploads, no API keys, no network calls.

## Features

**Privacy**
- 🫧 **Blur brush** — gaussian or pixelate, size + strength, click for a single dab
- 🙈 **Blur faces** — one-tap detection where the browser supports `FaceDetector`
  (when it is unavailable the button says so and points you at the brush)

**Mark up**
- 🅣 **Text** — captions with colour, size and an optional chip
- ➤ **Arrow**, ▭ **Box**, ✎ **Draw** — freehand and shapes; Box has an
  Outline / Filled toggle, so a filled box doubles as a solid bar
- Grab any mark to move it, `Delete selected` to remove it, with a dashed outline
  showing what is selected
- Everything is stored in source space, so marks follow the photo when you crop or rotate

**Frame**
- ✂️ **Crop** — free drag plus `1:1`, `4:5`, `16:9`, `3:2`, `4:3`, `9:16`, `1.91:1`
- ✨ **Auto crop** — largest centred crop of the chosen shape
- 🔄 **Rotate** — quarter turns, flip, and a fine angle slider
- 📐 **Fit corners** — removes the transparent wedges left by straightening
- 🎚️ **Adjust** — brightness, contrast, saturation, grayscale, sepia, hue + presets

**Workflow**
- ↔️ **Compare** — drag the ball on the divider to scrub, or side-by-side. It is
  an overlay, not a mode: you can keep editing while it is open, and the original
  side ignores your filters, so the two really do differ. Hold `O` to peek too.
- ↩ **Undo/redo** for every edit
- 🧪 **Recipes** — save a look and reapply it to other images
- 💾 **Resume** — an unfinished edit in the full editor survives a reload
- 📏 **Export intelligence** — live size estimate and a one-click "fit under 5 MB" for X
- 📦 **Multi-image batches** — edit several photos, inject them all at once
- 🖱 **Right-click** any image on X → *Edit this image with TweetShot*
- 🗂 Pasting an image or dragging one onto the editor both load it

**Shortcuts**: `Ctrl/⌘+Z` undo · `Ctrl/⌘+Shift+Z` redo · `Ctrl/⌘+S` save ·
`Ctrl/⌘+Enter` apply · `[` `]` brush size · `1`–`6` tools · `O` compare-original ·
`C` cycle compare · `Esc` close

## Design

The editor is built as a **calibration plate** rather than a generic toolbar: the
photo sits on a darkroom backdrop with print registration marks and live pixel
rulers, and those rulers highlight your crop/cover selection in real time.

- **Type** — Archivo for equipment-style labels, IBM Plex Sans for the interface,
  IBM Plex Mono for every number (dimensions, slider values, ruler ticks).
- **Color** — a deep blue-black darkroom dark with X-blue as the single
  functional accent; safelight red is reserved for redaction. A "paperproof"
  light theme mirrors it and follows `prefers-color-scheme`.
- **Fonts are bundled locally** (`fonts/`, ~100 KB) and registered with the
  FontFace API, so the extension still makes zero network calls and is immune to
  the host page's CSP.

## Project layout

```
manifest.json               # Chrome / Edge
manifest.firefox.json       # Firefox variant (see below)
background.js               # service worker: context menu, opens the editor
lib/editor-core.js          # canvas engine (no deps, unit-tested)
lib/editor-ui.js            # editor card: tools, pointer, undo, recipes, export
lib/editor-ui.css           # shared styles (darkroom + paperproof themes)
content/content.js          # X.com detection, batching, injection
editor/editor.html|css|js   # full-page editor (shell + resume + ?src=)
popup/popup.html|js
_locales/en/messages.json   # UI strings (chrome.i18n)
fonts/*.woff2               # bundled Archivo / IBM Plex (no network)
icons/icon{16,48,128}.png
test/core.test.js           # node:test coverage for the core math
```

## Install (dev)

**Chrome / Edge**
1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder
2. Go to `https://x.com/compose/post`, attach one or more photos
3. Click **✎ Edit** on a preview (or **Edit photo** in the toolbar)
4. Edit → **Use in tweet**

**Firefox** — MV3 support differs (event pages instead of a service worker), so
build the Firefox copy first:

```bash
cp manifest.firefox.json manifest.json   # in a copy of the folder
```

Then load it via `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**.
The Firefox manifest is provided but has **not been verified in a real Firefox
build** — treat it as a starting point.

Reload the extension *and the X tab* after pulling changes so the content script
is re-injected.

## Development

```bash
npm test            # unit tests for geometry, crop, transforms, annotations, fitting
npm run lint        # syntax-check every script
npm run test:browser   # end-to-end smoke test for the content script
npm run preflight   # Chrome Web Store blockers (manifest, icons, remote code, hosts)
npm run build       # -> dist/tweetshot-<version>.zip
npm run test:artifact  # build, then run the browser suite against the packaged zip
```

`test:browser` boots a fake X composer in a real browser and drives every way
into the editor — the toolbar picker, the composer's own file input, the ✎ Edit
badge, and a simulated invalidated extension context. It needs `playwright-cli`
on your PATH and skips cleanly without it. Use it whenever you touch
`content/content.js`: a single undefined reference there makes the whole editor
fail silently on the live site, which unit tests cannot catch.

## How the injection works

- The content script watches `input[data-testid="fileInput"]` and composer previews.
- File selection is intercepted in the **capture phase**, before X's React
  handler, so X never uploads the untouched original.
- On save the edited canvas becomes a `File` and is pushed into the composer's
  media input (which X often hoists outside the composer, so the lookup falls
  back to the known testid and then to any image input), dispatching
  `input` + `change`; if no input can be reached it falls back to a synthetic
  paste, then to the clipboard. It never silently downloads.
- Editing an attached image removes the matching preview afterwards (found
  relative to that image, not by a global selector).
- The image is also copied to the clipboard as a backup.

If X changes its DOM (`data-testid` values), update `FILE_SEL` / `composerScope`
in `content/content.js`.

## Privacy

All processing is client-side via `<canvas>`. Re-encoding drops EXIF metadata
(including GPS), nothing is uploaded, and no analytics or remote fonts are used.

## Releasing

```bash
npm run lint && npm test      # code health
npm run preflight             # store blockers
npm run test:artifact         # proves the packaged build works
npm run build                 # dist/tweetshot-<version>.zip  -> upload this
```

Then bump the version in `manifest.json`, `manifest.firefox.json` and
`package.json` before each upload — the store rejects a version it has already
seen. Copy for the store listing (name, descriptions, permission justifications,
data-usage answers, reviewer test steps) lives in **[STORE_LISTING.md](STORE_LISTING.md)**,
and the privacy policy to host is **[PRIVACY.md](PRIVACY.md)**.

## Next ideas

- Text/shape alignment guides and multi-select for marks
- Background removal and perspective correction
- Trim/export presets for video stills
