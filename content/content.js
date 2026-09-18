/* TweetShot content script — attaches the editor to the X/Twitter composer.
 *
 * v3 highlights:
 *  - shared editor UI (lib/editor-ui.js) instead of its own copy
 *  - multi-image batches are queued, not silently dropped
 *  - cancelling a batch hands the originals back to X (no data loss)
 *  - debounced MutationObserver (was firing on every DOM mutation)
 *  - paste an image into the composer to open the editor
 */
(function () {
  const ext = typeof browser !== 'undefined' && browser.runtime ? browser : typeof chrome !== 'undefined' ? chrome : null;

  // Never let a stale/invalidated extension context kill the whole script.
  const VERSION = (() => {
    try {
      return ext && ext.runtime && ext.runtime.getManifest ? ext.runtime.getManifest().version : '0.0.0';
    } catch {
      return '0.0.0';
    }
  })();

  const MODAL_ID = 'txe-modal-root';
  const FILE_SEL = 'input[data-testid="fileInput"]';

  const previousVersion = window.__txeVer;
  // Same build already running in this tab — do not double-register listeners.
  if (window.__txeInjected && previousVersion === VERSION) return;
  window.__txeInjected = true;
  window.__txeVer = VERSION;

  // Taking over from an older build (e.g. right after an extension update):
  // tear down its leftover UI so ours is the only one on the page.
  const tookOver = !!previousVersion && previousVersion !== VERSION;
  if (tookOver) {
    document.querySelectorAll(`#${MODAL_ID}, .txe-edit-badge, .txe-toolbar-btn`).forEach((n) => n.remove());
    // let the new build re-badge previews the old build had marked
    document.querySelectorAll('img[data-txe-badged]').forEach((n) => delete n.dataset.txeBadged);
  }
  document.getElementById(MODAL_ID)?.remove();
  document.documentElement.dataset.txeVer = VERSION;

  const core = new window.TweetImageEditorCore();

  let ui = null;
  let batchTotal = 0;
  let queue = []; // files still to edit
  let edited = []; // edited File objects ready to inject
  let interceptMode = null; // 'native' | 'attached' | 'picked'
  let targetInput = null;
  let replaceImg = null; // preview <img> to remove after a successful save
  let pickerEl = null; // persistent file input for the "Edit photo" fallback

  /* ======================================================== X/Twitter hooks */

  function composerScope(node) {
    let el = node instanceof Element ? node.parentElement : null;
    for (let i = 0; i < 10 && el && el !== document.body; i++) {
      if (el.matches('article[data-testid="tweet"]')) return null;
      if (el.matches('[role="dialog"], form')) {
        return el.querySelector('[data-testid="tweetTextarea_0"]') ? el : null;
      }
      if (el.matches('main, [data-testid="primaryColumn"]')) return null;
      if (
        el.querySelector &&
        el.querySelector('[data-testid="tweetTextarea_0"]') &&
        el.querySelector('div[data-testid="toolBar"]')
      )
        return el;
      el = el.parentElement;
    }
    return null;
  }

  // Locate X's media input. It is often hoisted outside the composer subtree,
  // so prefer a composer-scoped match but fall back to the known testid and then
  // to any image input — otherwise injection silently degrades to a download.
  // `strong` marks a candidate we trust enough not to verify.
  function findFileInput() {
    const all = [...document.querySelectorAll('input[type="file"]')].filter(
      (i) => i.dataset.txeOwn !== '1' && i !== pickerEl
    );
    for (const i of all) if (i.matches(FILE_SEL) && composerScope(i)) return { input: i, strong: true };
    for (const i of all) if (i.matches(FILE_SEL)) return { input: i, strong: true };
    for (const i of all) if (composerScope(i)) return { input: i, strong: false };
    for (const i of all) if (!i.accept || /image/.test(i.accept)) return { input: i, strong: false };
    return null;
  }

  function composerInput() {
    const found = findFileInput();
    return found ? found.input : null;
  }

  function setInputFiles(input, files) {
    try {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.dataset.txeOwn = '1';
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => delete input.dataset.txeOwn, 800);
      return true;
    } catch (err) {
      delete input.dataset.txeOwn;
      console.warn('TweetShot: could not set files on the composer input', err);
      return false;
    }
  }

  // X accepts pasted images, so a synthetic paste is a second way in when the
  // file input cannot be reached.
  function injectViaPaste(files) {
    const host = document.querySelector('[data-testid="tweetTextarea_0"]');
    if (!host) return false;
    const target = host.querySelector('[contenteditable="true"]') || host;
    let dt;
    let ev;
    try {
      dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
    } catch {
      return false;
    }
    try {
      ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    } catch {
      ev = new Event('paste', { bubbles: true, cancelable: true });
    }
    if (!ev.clipboardData) {
      try {
        Object.defineProperty(ev, 'clipboardData', { value: dt });
      } catch {
        /* give up on the paste route */
      }
    }
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* focus is best-effort */
    }
    target.dispatchEvent(ev);
    return true;
  }

  // Resolve true as soon as the composer shows more previews than before.
  function waitForNewImages(beforeCount, timeout = 1500) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (composerImages().length > beforeCount) return resolve(true);
        if (Date.now() - t0 > timeout) return resolve(false);
        setTimeout(tick, 100);
      };
      setTimeout(tick, 100);
    });
  }

  async function copyImageToClipboard(files) {
    const file = files && files[0];
    if (!file || !navigator.clipboard || typeof ClipboardItem === 'undefined') return false;
    try {
      let blob = file;
      if (file.type !== 'image/png') blob = await toPng(file);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  function toPng(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob((b) => resolve(b || file), 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function composerImages() {
    return [...document.querySelectorAll('img[src^="blob:"], img[src^="data:image"]')].filter((img) => {
      if (img.closest('#' + MODAL_ID)) return false;
      if (!composerScope(img)) return false;
      const r = img.getBoundingClientRect();
      return r.width >= 50 && r.height >= 50;
    });
  }

  function badgeImages() {
    for (const img of composerImages()) {
      if (img.dataset.txeBadged) continue;
      img.dataset.txeBadged = '1';
      const holder = img.parentElement;
      if (!holder) continue;
      holder.style.position = holder.style.position || 'relative';
      const b = document.createElement('button');
      b.className = 'txe-edit-badge';
      b.type = 'button';
      b.textContent = '✎ Edit';
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        editAttachedImage(img);
      });
      holder.appendChild(b);
    }
  }

  function toolbarBtn() {
    for (const tb of document.querySelectorAll('div[data-testid="toolBar"]')) {
      if (tb.querySelector('.txe-toolbar-btn')) continue;
      if (!composerScope(tb)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'txe-toolbar-btn';
      b.innerHTML = '<span>🖼️</span> Edit photo';
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const imgs = composerImages();
        if (imgs.length) editAttachedImage(imgs[0]);
        else pickAndEdit();
      });
      tb.appendChild(b);
    }
  }

  function ensureUI() {
    if (ui) return ui;
    ui = window.TXECreateEditorUI({
      core,
      rootId: MODAL_ID,
      version: VERSION,
      saveLabel: 'Use in tweet',
      onSave: handleSave,
      onClose: handleClose,
      onToast: toast,
    });
    return ui;
  }

  /* ============================================================== batching */

  function startBatch(files, mode, input, img) {
    try {
      const images = [...files].filter((f) => isImageFile(f));
      if (!images.length) {
        toast('That file is not an image');
        return;
      }
      interceptMode = mode;
      targetInput = input || null;
      replaceImg = img || null;
      queue = images.slice();
      edited = [];
      batchTotal = images.length;
      ensureUI().open(nextFile());
    } catch (err) {
      // Never fail silently: surface the reason instead of a dead button.
      console.error('TweetShot: could not open the editor', err);
      toast('TweetShot failed to open — reload the X tab and try again');
    }
  }

  // Browsers leave `type` empty for some formats (e.g. HEIC on macOS), so fall
  // back to the file extension instead of dropping the image.
  function isImageFile(f) {
    if (!f) return false;
    if (f.type && f.type.startsWith('image/')) return true;
    return f.type === '' && /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || '');
  }

  function nextFile() {
    const file = queue.shift();
    if (!file) return null;
    const done = edited.length + 1;
    ensureUI().setSaveLabel(queue.length ? `Next image (${done}/${batchTotal})` : 'Use in tweet');
    return file;
  }

  async function handleSave({ blob, filename }) {
    const name = filename || 'tweetshot.png';
    edited.push(new File([blob], name, { type: blob.type || 'image/png' }));

    if (queue.length) {
      toast(`Edited ${edited.length} of ${batchTotal}`);
      ui.open(nextFile());
      return;
    }
    await finish();
  }

  async function finish() {
    const files = edited.slice();
    const img = replaceImg;
    const input = targetInput;
    interceptMode = null;
    resetBatch();

    const ok = await injectFiles(files, img, input);
    if (ok) {
      ui?.close();
      toast('Added to tweet ✓');
      maybeInviteStar();
      return;
    }
    // Nothing may be lost: copy so a simple paste finishes the job, and only
    // fall back to a download if even the clipboard is unavailable.
    const copied = await copyImageToClipboard(files);
    ui?.close();
    if (copied) {
      toast('Composer not reachable — image copied, press Ctrl/⌘+V in the tweet');
    } else {
      toast('Could not reach the composer — downloading instead');
      files.forEach(downloadFile);
    }
  }

  // Cancelled / closed mid-batch: give X everything we did not consume.
  async function handleClose() {
    if (interceptMode !== 'native' || !targetInput) {
      resetBatch();
      return;
    }
    // Cancelled mid-batch: hand X everything we did not consume, and if the
    // composer cannot be reached, copy rather than lose the files.
    const leftover = [...edited, ...queue];
    const input = targetInput;
    resetBatch();
    if (!leftover.length) return;
    if (await injectFiles(leftover, null, input)) {
      toast('Originals kept — nothing lost');
      return;
    }
    const copied = await copyImageToClipboard(leftover);
    if (copied) toast('Originals copied — press Ctrl/⌘+V in the tweet');
    else {
      toast('Could not reach the composer — downloading the originals');
      leftover.forEach(downloadFile);
    }
  }

  function resetBatch() {
    interceptMode = null;
    targetInput = null;
    replaceImg = null;
    queue = [];
    edited = [];
    batchTotal = 0;
  }

  async function injectFiles(files, imgToReplace, inputOverride) {
    if (!files || !files.length) return true;
    const before = composerImages().length;

    const remembered =
      inputOverride && document.contains(inputOverride) ? { input: inputOverride, strong: true } : null;
    const found = remembered || findFileInput();

    if (found && setInputFiles(found.input, files)) {
      if (imgToReplace) setTimeout(() => removeOriginalPreview(imgToReplace), 900);
      // X's own input is trustworthy; a guessed one has to prove itself
      if (found.strong || (await waitForNewImages(before, 1400))) return true;
    }

    if (injectViaPaste(files) && (await waitForNewImages(before, 1800))) {
      if (imgToReplace) setTimeout(() => removeOriginalPreview(imgToReplace), 900);
      return true;
    }
    return false;
  }

  // Click the X "Remove media" button that belongs to this specific preview.
  function removeOriginalPreview(img) {
    let el = img.parentElement;
    for (let i = 0; i < 6 && el; i++) {
      const btn = el.querySelector('button[aria-label*="Remove" i]');
      const imgs = el.querySelectorAll('img[src^="blob:"], img[src^="data:image"]');
      if (btn && imgs.length === 1) {
        btn.click();
        return true;
      }
      if (el.matches('[data-testid="attachments"]')) return false;
      el = el.parentElement;
    }
    return false;
  }

  // Small on-page toast. Kept local (and passed to the UI as `onToast`) so
  // there is exactly one implementation and no callback loop.
  function toast(msg) {
    let el = document.querySelector('.txe-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'txe-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.pointerEvents = '';
    el.classList.add('show');
    clearTimeout(el.__txeTimer);
    el.__txeTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* One-time, never-repeating thank-you after a successful edit. It runs exactly
   * once ever (flagged in storage) so it can never become nagging — and it is
   * just a link, so it makes no request unless someone clicks it. */
  function maybeInviteStar() {
    try {
      const store = ext && ext.storage && ext.storage.local;
      if (!store) return;
      const run = (alreadyAsked) => {
        if (alreadyAsked) return;
        try {
          store.set({ txeStarNudge: 1 });
        } catch {
          /* ignore */
        }
        setTimeout(showStarToast, 2200);
      };
      const res = store.get('txeStarNudge');
      if (res && typeof res.then === 'function') {
        res.then((r) => run(!!(r && r.txeStarNudge))).catch(() => {});
      } else {
        store.get('txeStarNudge', (r) => run(!!(r && r.txeStarNudge)));
      }
    } catch {
      /* no storage — skip the nudge entirely */
    }
  }

  function showStarToast() {
    let el = document.querySelector('.txe-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'txe-toast';
      document.body.appendChild(el);
    }
    el.textContent = '';
    el.style.pointerEvents = 'auto';
    const label = document.createElement('span');
    label.textContent = 'Open source, and nothing leaves your device. ';
    const link = document.createElement('a');
    link.href = window.TXE_REPO_URL || 'https://github.com/thegreatLUCY/tweetshot';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '★ Star TweetShot on GitHub';
    link.style.color = '#1d9bf0';
    link.style.fontWeight = '700';
    link.style.textDecoration = 'none';
    const caption = document.createElement('span');
    caption.textContent = ' — it helps a lot.';
    el.append(label, link, caption);
    el.classList.add('show');
    clearTimeout(el.__txeTimer);
    el.__txeTimer = setTimeout(() => {
      el.classList.remove('show');
      el.style.pointerEvents = '';
    }, 8000);
  }

  function downloadFile(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name || 'tweetshot.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ======================================================== entry points */

  function onFileChangeCapture(e) {
    const t = e.target;
    if (!t || !t.matches || !t.matches(FILE_SEL)) return;
    if (t.dataset.txeOwn === '1') return;
    if (!composerScope(t)) return;
    const files = [...(t.files || [])].filter((f) => isImageFile(f));
    if (!files.length) return;
    // take over from X and open our editor with the whole selection
    e.preventDefault();
    e.stopImmediatePropagation();
    t.value = '';
    startBatch(files, 'native', t, null);
  }

  async function editAttachedImage(img) {
    try {
      const blob = await (await fetch(img.currentSrc || img.src)).blob();
      startBatch([new File([blob], 'attached.png', { type: blob.type || 'image/png' })], 'attached', composerInput(), img);
    } catch {
      toast('Could not read that image');
    }
  }

  function pickAndEdit() {
    if (!pickerEl) {
      // Attached to the DOM and kept in a module variable: a detached input can
      // be garbage-collected before the file picker resolves, which silently
      // loses the change event.
      pickerEl = document.createElement('input');
      pickerEl.type = 'file';
      pickerEl.accept = 'image/*';
      pickerEl.multiple = true;
      pickerEl.style.display = 'none';
      pickerEl.addEventListener('change', () => {
        if (pickerEl.files && pickerEl.files.length) {
          startBatch(pickerEl.files, 'picked', composerInput(), null);
        }
      });
      document.body.appendChild(pickerEl);
    }
    pickerEl.value = '';
    pickerEl.click();
  }

  /* ============================================================ lifecycle */

  function inComposerFocus() {
    const ae = document.activeElement;
    return !!(ae && ae !== document.body && composerScope(ae));
  }

  let observerQueued = false;
  let rescanTimer = 0;
  function scan() {
    badgeImages();
    toolbarBtn();
  }
  function scheduleRescan() {
    // A freshly inserted <img> often has a 0×0 box at mutation time, so scan on
    // the next frame *and* again shortly after — otherwise the Edit badge is
    // silently missed and the preview looks unresponsive.
    if (!observerQueued) {
      observerQueued = true;
      requestAnimationFrame(() => {
        observerQueued = false;
        scan();
      });
    }
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scan, 180);
  }

  function init() {
    // 1) Take over native file selection before X's React handler sees it.
    document.addEventListener('change', onFileChangeCapture, true);
    // 2) Paste an image while focused in the composer.
    document.addEventListener(
      'paste',
      (e) => {
        if (ui && ui.isOpen) return; // the editor handles its own paste
        if (!inComposerFocus()) return;
        const files = [...(e.clipboardData?.files || [])].filter((f) => isImageFile(f));
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        startBatch(files, 'picked', composerInput(), null);
      },
      true
    );
    // 3) Badge previews / add the toolbar button, debounced per burst.
    new MutationObserver(scheduleRescan).observe(document.body, { childList: true, subtree: true });
    // images finish loading after they are inserted — rescan when they do
    document.addEventListener('load', (e) => {
      if (e.target && e.target.tagName === 'IMG') scheduleRescan();
    }, true);
    scheduleRescan();
    // 4) "Edit this image with TweetShot" from the right-click menu.
    ext?.runtime?.onMessage?.addListener((msg) => {
      if (msg && msg.type === 'TXE_EDIT_IMAGE' && msg.srcUrl) editImageFromUrl(msg.srcUrl);
    });
  }

  // Fetch an image the user right-clicked and open it in the editor. Runs in
  // the page context so it inherits the page's CORS permissions.
  async function editImageFromUrl(srcUrl) {
    try {
      const blob = await (await fetch(srcUrl, { mode: 'cors' })).blob();
      if (!isImageFile(blob)) throw new Error('not an image');
      const name = (srcUrl.split('?')[0].split('/').pop() || 'image').slice(0, 60);
      startBatch([new File([blob], name, { type: blob.type })], 'picked', composerInput(), null);
    } catch {
      toast('Could not read that image — try the full editor');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
