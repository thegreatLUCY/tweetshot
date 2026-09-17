# TweetShot — Privacy Policy

**Last updated: 17 September 2026**

TweetShot is an image editor that runs entirely inside your browser. This policy
explains exactly what it does and does not do with your data.

## The short version

**TweetShot does not collect, transmit, sell or share any data.** Every image you
edit is processed locally on your own device using the browser's built-in
`<canvas>` API. Nothing is ever uploaded to us or to anyone else.

## What the extension accesses, and why

| Access | Why | Where it goes |
|---|---|---|
| Photos you choose to edit | To display and edit them in the editor | Stays in your browser's memory. Never uploaded. |
| The X/Twitter composer page (`x.com`, `twitter.com`) | To add the "Edit photo" button, detect attached images, and put the edited image back into the tweet | Stays on the page. No page content is transmitted. |
| Browser local storage | To remember your editor preferences (brush size, theme, saved looks) and, in the full-page editor, an unfinished edit so it survives a page reload | Stays on your device. Never transmitted. |
| Clipboard (write only) | To copy the edited image when you press Copy, or as a fallback when the composer cannot be reached | Written only when you ask for it. Never read. |
| Right-click menu | To add one item, "Edit this image with TweetShot", on X/Twitter pages | Local only. |

## What TweetShot never does

- No analytics, telemetry, tracking pixels or crash reporting.
- No network requests to any server we control. The extension makes **no network
  requests at all**.
- No reading of your messages, timeline, direct messages, credentials or
  browsing history.
- No remote code. All JavaScript and all fonts are bundled inside the extension.
- No advertising and no data sharing with third parties.

## Fonts

The editor's typefaces (Archivo and IBM Plex, both open source) are bundled as
files inside the extension and loaded with the browser's FontFace API. They are
not fetched from Google Fonts or any other server at runtime.

## Metadata

When you save an edited image, it is re-encoded by your browser. This removes the
original file's EXIF metadata, including GPS location information. That is a
feature, not a bug — but be aware it applies to any image you export.

## Permissions explained

- **`storage`** — remember your preferences and (optionally) an unfinished edit
  locally.
- **`clipboardWrite`** — copy the edited image when you ask for it.
- **`contextMenus`** — one right-click item on X/Twitter pages.
- **Host access to `https://x.com/*` and `https://twitter.com/*`** — required to
  work inside the composer. The extension runs on no other website.

## Children's privacy

TweetShot does not collect data from anyone, including children.

## Changes to this policy

If this policy changes, the "Last updated" date above will change and the new
version will ship with the extension update.

## Contact

Questions about this policy: https://github.com/thegreatLUCY/tweetshot/issues

A hosted copy of this policy lives at https://thegreatlucy.github.io/tweetshot/privacy.html
