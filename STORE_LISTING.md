# Chrome Web Store submission pack

Copy-paste values for https://chrome.google.com/webstore/devconsole
Everything here matches `manifest.json` v1.0.0. Run `npm run build` first and
upload `dist/tweetshot-1.0.0.zip`.

---

## 1. Item name (max 45 chars)

```
TweetShot — Image Editor for X/Twitter
```

> **Decision: keeping this name.** It is purely descriptive ("for X"), which is
> normally tolerated, and it wins on search. Submit as **Unlisted** first — if
> review pushes back on the name, swap to a fallback below, update
> `_locales/en/messages.json → appName`, `npm run build`, and resubmit. Nothing
> else in the listing has to change.

Lower-risk alternatives if it ever gets rejected:

```
TweetShot — Composer Image Editor        (35)
TweetShot — Edit Photos Before Posting   (39)
TweetShot — Blur & Crop for Posts        (34)
```

If you change the name, update `_locales/en/messages.json → appName`, then
`npm run build` so the manifest and the listing agree. The store flags a mismatch.

## 2. Short description (max 132 chars — comes from the manifest)

```
Blur, crop, annotate and enhance images right in the X/Twitter composer before you post.
```
(88 chars — do not exceed 132.)

## 3. Detailed description

```
Edit a photo before you post it — without leaving the composer.

TweetShot puts a full image editor inside the X/Twitter compose window. Attach a
photo, click Edit, and get your image ready in seconds. Everything happens on
your own device: no uploads, no accounts, no watermark, no waiting.

WHAT YOU CAN DO

• Blur or pixelate — a brush for faces, plates and anything else you need to
  soften. Adjust the size and strength; click once for a single dab.
• Cover things up — draw boxes, or blur whole faces in one tap where your
  browser supports it.
• Annotate — add text captions with a background chip, arrows, outline or filled
  boxes, and freehand drawing. Drag any mark to reposition it.
• Crop — free drag plus 1:1, 4:5, 16:9, 3:2, 4:3, 9:16 and 1.91:1 presets. Auto
  crop picks the largest crop of the shape you chose.
• Straighten — quarter turns, flips and a fine angle slider, with "Fit corners"
  to trim the empty wedges a straighten leaves behind.
• Adjust — brightness, contrast, saturation, grayscale, sepia and hue, with
  presets (Vivid, B&W, Warm, Cold, Fade). Save a look as a recipe and reuse it.
• Compare — drag the divider across the photo for a real before/after, or view
  them side by side. Keep editing while you compare.
• Export with confidence — a live file-size estimate and a one-click "fit under
  5 MB" so a photo never gets rejected for being too large.

HOW IT WORKS

Everything is drawn with the browser's built-in canvas API, on your machine. The
extension has no servers: it makes no network requests at all, and the fonts are
bundled inside it.

PRIVACY

• No uploads. Your photos never leave your device.
• No accounts, no sign-in, no analytics, no tracking.
• No ads, and nothing is ever sold or shared.
• Saving an image re-encodes it, which strips EXIF metadata such as GPS
  location.

TweetShot is built for people who post photos and want to keep some things
private — a face, a licence plate, an address, a name on a badge.

Works in Chrome and other Chromium browsers. Also edits any image in the
full-page editor, even without X open.
```

## 4. Category & language

- **Category:** `Photos` (secondary option: `Social & Communication`)
- **Language:** `English`

## 5. Screenshots (1280×800, up to 5, at least 1)

Capture these, then make sure each is **exactly 1280×800** — `sips -z 800 1280 in.png`
resizes, or crop in Preview.

| # | Shot | Suggested caption |
|---|---|---|
| 1 | Editor open over the composer, dark theme, a face partially blurred | "Edit photos right in the composer" |
| 2 | Compare mode, divider mid-drag | "Drag to compare before and after" |
| 3 | Mark tool: caption + arrow on the photo | "Add captions, arrows and boxes" |
| 4 | Crop tab with a 4:5 preset selected and guides visible | "Crop and straighten for X" |
| 5 | Export panel showing the live size estimate | "Never hit the file-size limit" |

How to grab them: open the full-page editor (`editor/editor.html`) or the
composer, put Chrome in dark mode, size the window so the viewport is 16:10, then
`⌘⇧4` + `Space` to capture the window.

Optional extras:
- **Small promo tile** 440×280
- **Marquee** 1400×560 (only needed if you want featured placement)

## 6. Permission justifications (the dashboard asks for each)

**Single purpose statement**
```
TweetShot lets you edit a photo before posting it, without leaving the X/Twitter
composer. Every feature exists to support that single purpose.
```

**`storage`**
```
Remembers the user's editor preferences (brush size, theme, saved looks) locally,
and optionally keeps one unfinished edit so it survives a page reload. Nothing is
ever transmitted off the device.
```

**`clipboardWrite`**
```
Copies the edited image to the clipboard when the user presses Copy, or as a
fallback when the composer cannot be reached so the user can paste it themselves.
The clipboard is never read.
```

**`contextMenus`**
```
Adds a single right-click item, "Edit this image with TweetShot", on X/Twitter
pages.
```

**Host permission `https://x.com/*`, `https://twitter.com/*`**
```
Required to detect the tweet composer, add the editor UI to it, read the image the
user chooses to edit, and insert the edited image back into the tweet. The
extension runs on no other site.
```

**Remote code**
```
No. All JavaScript and all fonts are bundled in the extension package. There are
no remote scripts, no eval, no dynamic imports and no network requests.
```

**`web_accessible_resources` (bundled fonts)**
```
Four .woff2 font files are exposed to the content script so the editor UI renders
consistently. They are local files; no remote fonts are used.
```

## 7. Data usage / privacy practices form

- Does the extension collect user data? **No.**
- Tick none of the data-type checkboxes — nothing is collected or transmitted.
- Certification checkboxes (sold to third parties / unrelated purposes /
  creditworthiness): **all "No".**
- **Privacy policy URL:** required. Host `PRIVACY.md` publicly first — the easiest
  options are a GitHub Gist (use the raw URL) or GitHub Pages. Replace the
  placeholder contact email in it before publishing.

## 7b. URLs

| Store field | URL |
|---|---|
| **Home page URL** | `https://thegreatlucy.github.io/tweetshot/` |
| **Support URL** | `https://github.com/thegreatLUCY/tweetshot/issues` |
| **Privacy policy URL** (Privacy tab) | `https://thegreatlucy.github.io/tweetshot/privacy.html` |

## 8. Distribution

- **Visibility:** start with **Unlisted** to get through review and install it
  yourself, then switch to **Public**.
- **Regions:** all.
- **EU DSA:** you must declare trader or non-trader. An individual shipping a free
  extension can declare **non-trader**; no address or phone number is then shown.

## 9. Reviewer testing instructions (this box matters — use it)

```
TweetShot edits images before they are posted. Two ways to test:

1. NO ACCOUNT NEEDED — click the extension icon, then "Open full editor".
   Drop any image file onto the page. Every editing tool works here: Blur brush,
   Mark (text / arrow / box / draw), Crop with presets and Auto, Adjust with
   presets and recipes, Rotate with "Fit corners", and the Compare button in the
   top bar (drag the ball on the divider). Use Export to set format and size, then
   Download. Press Ctrl/⌘+Z to undo.

2. INSIDE THE COMPOSER (needs an X/Twitter login) — go to
   https://x.com/compose/post, attach a photo, then click the "✎ Edit" badge on
   the photo preview (or the "Edit photo" button in the toolbar). Edit and press
   "Use in tweet": the edited image is placed back into the composer.

Note: "Blur faces" is enabled only in browsers that expose the FaceDetector API
(Chrome on Android/ChromeOS); elsewhere the button explains this and the blur
brush does the job.

No account, no network requests, and no data leaves the device.
```

---

## Submission checklist

```bash
npm run lint && npm test      # code health
npm run preflight             # store blockers
npm run test:artifact         # the packaged build actually works
npm run build                 # -> dist/tweetshot-1.0.0.zip
```

- [ ] Developer account registered and **$5** fee paid
- [ ] Developer email verified
- [ ] `manifest.json` version bumped beyond the last upload
- [ ] `dist/tweetshot-1.0.0.zip` uploaded
- [ ] Name / short / detailed description pasted (name matches the manifest)
- [ ] Category + language set
- [ ] 1–5 screenshots at exactly 1280×800
- [ ] Privacy policy hosted publicly, URL pasted
- [ ] Permission justifications pasted (all of them)
- [ ] Data usage form completed
- [ ] Reviewer testing instructions pasted
- [ ] DSA trader status declared
- [ ] Submitted as **Unlisted**, tested by you, then switched to **Public**

Review typically takes a few days. If it comes back rejected it is almost always
one of: name/trademark, missing privacy policy, vague permission justification, or
"screenshot doesn't show the extension working" — all covered above.
