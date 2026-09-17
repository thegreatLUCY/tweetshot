/* TweetShot full-page editor — shell around the shared editor UI.
 * Adds resume-last-edit (IndexedDB) and an image-URL entry point (?src=).
 */
(function () {
  const ext = typeof browser !== 'undefined' && browser.runtime ? browser : typeof chrome !== 'undefined' ? chrome : null;
  const version = ext && ext.runtime && ext.runtime.getManifest ? ext.runtime.getManifest().version : '';

  const mount = document.getElementById('editorMount');
  const core = new window.TweetImageEditorCore();

  const ui = window.TXECreateEditorUI({
    core,
    mode: 'inline',
    mount,
    version,
    downloadName: 'tweetshot',
    showSave: false, // no composer here — Download is the primary action
    allowDownload: true,
  });

  const fileInput = document.getElementById('file');
  const resumeBar = document.getElementById('resume');

  /* ------------------------------------------------------------- storage */

  const DB = 'tweetshot';
  const STORE = 'sessions';
  const KEY = 'last';

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbTx(mode, fn) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const rq = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(rq && rq.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  const idbPut = (k, v) => idbTx('readwrite', (s) => s.put(v, k));
  const idbGet = (k) => idbTx('readonly', (s) => s.get(k));
  const idbDel = (k) => idbTx('readwrite', (s) => s.delete(k));

  let resuming = false;

  async function persistSession() {
    if (resuming) return;
    try {
      if (!ui.hasEdits() || !core.loaded) {
        await idbDel(KEY);
        return;
      }
      const canvas = core.exportCanvas(320);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.7));
      await idbPut(KEY, {
        source: core.getSourceFile(),
        state: core.getState(),
        name: core.sourceName || 'Untitled',
        thumb: blob,
        ts: Date.now(),
      });
    } catch {
      /* resume is best-effort */
    }
  }

  /* --------------------------------------------------------------- loading */

  function pick() {
    fileInput.value = '';
    fileInput.click();
  }

  document.getElementById('openImage').addEventListener('click', pick);
  document.getElementById('emptyPick').addEventListener('click', pick);
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) load(fileInput.files[0]);
  });

  async function load(file) {
    await ui.open(file);
    document.body.classList.toggle('has-image', core.loaded);
    await persistSession();
  }

  ['dragover', 'dragenter'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) load(f);
  });

  // Save on the way out so a reload does not lose work.
  window.addEventListener('beforeunload', () => {
    persistSession();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistSession();
  });

  /* ---------------------------------------------------------------- resume */

  async function refreshResume() {
    if (!resumeBar) return;
    try {
      const rec = await idbGet(KEY);
      if (!rec || !rec.source) {
        resumeBar.hidden = true;
        return;
      }
      const when = new Date(rec.ts).toLocaleString();
      resumeBar.hidden = false;
      resumeBar.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = `Unfinished edit — ${rec.name || 'image'} · ${when}`;
      const resume = document.createElement('button');
      resume.className = 'pbtn primary';
      resume.textContent = 'Resume';
      resume.addEventListener('click', async () => {
        const fresh = await idbGet(KEY);
        if (!fresh || !fresh.source) return;
        resuming = true;
        await load(fresh.source);
        resuming = false;
        ui.applyState(fresh.state);
        await persistSession();
      });
      const discard = document.createElement('button');
      discard.className = 'pbtn';
      discard.textContent = 'Discard';
      discard.addEventListener('click', async () => {
        await idbDel(KEY);
        refreshResume();
      });
      resumeBar.append(label, resume, discard);
    } catch {
      resumeBar.hidden = true;
    }
  }

  /* ------------------------------------------------------- image URL entry */

  const params = new URLSearchParams(location.search);
  const src = params.get('src');

  (async function init() {
    await refreshResume();
    if (!src) return;
    try {
      const res = await fetch(src, { mode: 'cors' });
      const blob = await res.blob();
      const name = (src.split('?')[0].split('/').pop() || 'image').slice(0, 60);
      await load(new File([blob], name, { type: blob.type }));
    } catch {
      const empty = document.getElementById('empty');
      const note = document.createElement('p');
      note.textContent = 'That image could not be loaded here. Save it, then use “Choose an image”.';
      note.className = 'empty-error';
      empty.querySelector('.empty-card').appendChild(note);
    }
  })();
})();
