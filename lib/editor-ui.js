/* TweetShot shared editor UI (v4).
 *
 * One implementation of the editor card, used by both the in-composer modal
 * (content/content.js) and the full-page editor (editor/editor.js).
 *
 * v4 adds: Mark tool (text / arrow / box / pen), compare modes, auto face
 * blur, straighten-and-fit, auto crop, recipes, export size estimation and
 * i18n hooks.
 */
(function () {
  const Core = window.TweetImageEditorCore;
  const PRESETS = window.TXE_PRESETS;
  const FILTER_PRESETS = window.TXE_FILTER_PRESETS;

  const DEFAULT_PREFS = {
    theme: 'auto',
    brush: { strengthPct: 18, mode: 'blur' },
    mark: { color: '#ff3b30', width: 6, size: 48, bg: null, shape: 'text' },
    export: { type: 'image/jpeg', quality: 92, maxDim: 4096 },
  };

  const MARK_COLORS = ['#ff3b30', '#ffffff', '#000000', '#ffd60a', '#1d9bf0', '#34c759'];
  const TOOLS = ['blur', 'mark', 'crop', 'adjust', 'rotate'];
  const MARK_SHAPES = ['text', 'arrow', 'box', 'pen'];
  const X_MAX_BYTES = 5 * 1024 * 1024;

  /* ------------------------------------------------------------------ i18n */

  function t(key, fallback) {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
        const m = chrome.i18n.getMessage(key);
        if (m) return m;
      }
    } catch {
      /* no i18n available */
    }
    return fallback;
  }

  /* ------------------------------------------------------------ preferences */

  function mergePrefs(raw) {
    const p = raw || {};
    return {
      theme: p.theme || DEFAULT_PREFS.theme,
      brush: { ...DEFAULT_PREFS.brush, ...(p.brush || {}) },
      mark: { ...DEFAULT_PREFS.mark, ...(p.mark || {}) },
      export: { ...DEFAULT_PREFS.export, ...(p.export || {}) },
    };
  }

  function extStore() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
    } catch {
      /* ignore */
    }
    return null;
  }

  async function loadPrefs() {
    const store = extStore();
    if (!store) return mergePrefs(null);
    try {
      const { txePrefs } = await store.get('txePrefs');
      return mergePrefs(txePrefs);
    } catch {
      return mergePrefs(null);
    }
  }

  function savePrefs(prefs) {
    const store = extStore();
    if (store) store.set({ txePrefs: prefs });
  }

  async function loadRecipes() {
    const store = extStore();
    if (!store) return [];
    try {
      const { txeRecipes } = await store.get('txeRecipes');
      return Array.isArray(txeRecipes) ? txeRecipes : [];
    } catch {
      return [];
    }
  }

  function saveRecipes(list) {
    const store = extStore();
    if (store) store.set({ txeRecipes: list });
  }

  function resolveDark(theme) {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const fmtBytes = (n) => (n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

  /* ----------------------------------------------------------------- sprite */

  const SPRITE = `<svg class="txe-sprite" aria-hidden="true" focusable="false"><defs>
    <symbol id="txe-i-aperture" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9M12 12l7.8 4.5M12 12 4.2 16.5"/></symbol>
    <symbol id="txe-i-blur" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.4c3.5 4 5.9 6.9 5.9 9.7a5.9 5.9 0 1 1-11.8 0c0-2.8 2.4-5.7 5.9-9.7Z"/></symbol>
    <symbol id="txe-i-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6.5h14M12 6.5V19"/><path d="M9 16h6"/></symbol>
    <symbol id="txe-i-crop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2.5v12.6a2.4 2.4 0 0 0 2.4 2.4h12.1"/><path d="M2.5 7h12.1A2.4 2.4 0 0 1 17 9.4v12.1"/></symbol>
    <symbol id="txe-i-adjust" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5h8M17.5 8.5h3M3.5 15.5h3M11.5 15.5h9"/><circle cx="14" cy="8.5" r="2.3"/><circle cx="9" cy="15.5" r="2.3"/></symbol>
    <symbol id="txe-i-rotate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.6v4.3h-4.3"/></symbol>
    <symbol id="txe-i-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 6.3 12 6.3 21.5 12 21.5 12 18 17.7 12 17.7 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></symbol>
    <symbol id="txe-i-undo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h9.4a4.5 4.5 0 0 1 0 9H11"/><path d="M7.5 8.5 4 12l3.5 3.5"/></symbol>
    <symbol id="txe-i-redo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12h-9.4a4.5 4.5 0 0 0 0 9H13"/><path d="M16.5 8.5 20 12l-3.5 3.5"/></symbol>
    <symbol id="txe-i-reset" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.4h-4.4"/></symbol>
    <symbol id="txe-i-contrast" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/></symbol>
    <symbol id="txe-i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></symbol>
    <symbol id="txe-i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11.5M7.6 10.6 12 15l4.4-4.4"/><path d="M4.5 19.5h15"/></symbol>
    <symbol id="txe-i-export" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 14.5v3.6a1.9 1.9 0 0 0 1.9 1.9h11.2a1.9 1.9 0 0 0 1.9-1.9v-3.6"/><path d="M12 15.5V4M7.6 8.4 12 4l4.4 4.4"/></symbol>
    <symbol id="txe-i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.6l4.7 4.7L19 7.3"/></symbol>
    <symbol id="txe-i-compare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M7.5 8 3.5 12l4 4M16.5 8l4 4-4 4"/></symbol>
    <symbol id="txe-i-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="8.5" y="3.5" width="12" height="12" rx="2.2"/><path d="M15.5 18.5v.5a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h.5"/></symbol>
    <symbol id="txe-i-face" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8.6 14.6a4.5 4.5 0 0 0 6.8 0"/></symbol>
    <symbol id="txe-i-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l1.7 5 5 1.7-5 1.7L12 16.4l-1.7-5-5-1.7 5-1.7L12 3Z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></symbol>
    <symbol id="txe-i-fit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/><path d="M9 9h6v6H9z"/></symbol>
  </defs></svg>`;

  let fontsInjected = false;
  function injectFonts() {
    if (fontsInjected) return;
    fontsInjected = true;
    if (!document.fonts || typeof FontFace === 'undefined') return;
    const resolve = (file) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          return chrome.runtime.getURL('fonts/' + file);
        }
      } catch {
        /* not an extension context */
      }
      try {
        return new URL('../fonts/' + file, document.baseURI).href;
      } catch {
        return null;
      }
    };
    const faces = [
      ['Archivo', '100 900', 'archivo-var.woff2'],
      ['Plex UI', '100 700', 'ibm-plex-sans-var.woff2'],
      ['Plex Data', '400', 'ibm-plex-mono-400.woff2'],
      ['Plex Data', '500', 'ibm-plex-mono-500.woff2'],
    ];
    for (const [family, weight, file] of faces) {
      const url = resolve(file);
      if (!url) continue;
      try {
        const face = new FontFace(family, `url("${url}") format("woff2")`, { weight, style: 'normal', display: 'swap' });
        document.fonts.add(face);
        face.load().catch(() => {});
      } catch {
        /* fall back to the system stack */
      }
    }
  }

  /* ====================================================================== UI */

  function createEditorUI(opts = {}) {
    injectFonts();
    const core = opts.core || new Core();
    const mode = opts.mode === 'inline' ? 'inline' : 'modal';
    const downloadName = opts.downloadName || 'tweetshot';
    const saveLabel = opts.saveLabel || t('act_save', 'Use in tweet');
    const showSave = opts.showSave !== false;
    const allowDownload = opts.allowDownload !== false;

    let prefs = mergePrefs(null);
    let recipes = [];
    let tool = opts.initialTool || 'blur';
    let brush = { size: 140, strengthPct: prefs.brush.strengthPct, mode: prefs.brush.mode };
    let mark = { ...prefs.mark };
    let preset = 'free';
    let painting = null;
    let cropDrag = null;
    let cropping = false;
    let markDrag = null;
    let selectedAnn = -1;
    let draggingAnn = null;
    let meta = null;
    let isOpen = false;
    let showOriginal = false;
    let compareMode = 'off'; // off | wipe | side
    let wipePos = 0.5;
    let currentFile = null;
    let rafPending = false;
    let prevOverflow = null;
    let restoreFocus = null;
    let angleDirty = false;
    let saveBusy = false;
    let lastGeometrySig = null;
    let wipeSig = null;
    let sideSig = null;
    let estimateTimer = null;
    let estimateToken = 0;
    const sliderDirty = new Set();

    const root = document.createElement('div');
    root.className = 'txe-root' + (mode === 'inline' ? ' txe-inline' : '');
    if (opts.rootId) root.id = opts.rootId;
    const ic = (n) => `<svg class="txe-ic" aria-hidden="true"><use href="#txe-i-${n}"></use></svg>`;

    root.innerHTML = `
      ${SPRITE}
      ${mode === 'modal' ? '<div class="txe-bg" data-act="close"></div>' : ''}
      <div class="txe-card" role="dialog" aria-modal="true" aria-label="${t('app_title', 'TweetShot image editor')}" tabindex="-1">
        <div class="txe-top">
          <div class="txe-brand">
            <span class="txe-logo">${ic('aperture')}</span>
            <span class="txe-word">TweetShot</span>
            <span class="txe-dims" id="txeDims"></span>
          </div>
          <div class="txe-topbtns">
            <button type="button" class="txe-iconbtn" data-act="compare" title="${t('title_compare', 'Compare before / after (C)')}">${ic('compare')}</button>
            <button type="button" class="txe-iconbtn" data-act="original" title="${t('title_original', 'Press and hold to see the original (O)')}">${ic('eye')}</button>
            <button type="button" class="txe-iconbtn" data-act="undo" title="${t('title_undo', 'Undo (Ctrl/⌘+Z)')}">${ic('undo')}</button>
            <button type="button" class="txe-iconbtn" data-act="redo" title="${t('title_redo', 'Redo (Ctrl/⌘+Shift+Z)')}">${ic('redo')}</button>
            <button type="button" class="txe-iconbtn" data-act="reset" title="${t('title_reset', 'Reset all edits')}">${ic('reset')}</button>
            <button type="button" class="txe-iconbtn" data-act="theme" title="${t('title_theme', 'Switch light / dark')}">${ic('contrast')}</button>
            <button type="button" class="txe-iconbtn txe-x" data-act="close" title="${t('title_close', 'Close (Esc)')}" aria-label="${t('title_close', 'Close editor')}">${ic('close')}</button>
          </div>
        </div>

        <div class="txe-tabs" role="tablist" aria-label="${t('label_tools', 'Tools')}">
          <button type="button" data-tool="blur" class="on">${ic('blur')}<span>${t('tool_blur', 'Blur')}</span></button>
          <button type="button" data-tool="mark">${ic('mark')}<span>${t('tool_mark', 'Mark')}</span></button>
          <button type="button" data-tool="crop">${ic('crop')}<span>${t('tool_crop', 'Crop')}</span></button>
          <button type="button" data-tool="adjust">${ic('adjust')}<span>${t('tool_adjust', 'Adjust')}</span></button>
          <button type="button" data-tool="rotate">${ic('rotate')}<span>${t('tool_rotate', 'Rotate')}</span></button>
        </div>

        <div class="txe-main">
          <div class="txe-canvasbox" id="txeBox">
            <div class="txe-stage">
              <div class="txe-ruler txe-ruler-x" id="txeRulerX" aria-hidden="true"><span class="txe-sel" id="txeSelX"></span></div>
              <div class="txe-ruler txe-ruler-y" id="txeRulerY" aria-hidden="true"><span class="txe-sel" id="txeSelY"></span></div>
              <div class="txe-plate" id="txePlate">
                <canvas class="txe-cv" id="txeCv"></canvas>
                <canvas class="txe-cv txe-cv-orig" id="txeCvWipe" hidden aria-hidden="true"></canvas>
                <canvas class="txe-cv txe-cv-fx" id="txeCvFx" hidden aria-hidden="true"></canvas>
                <div class="txe-guides" id="txeGuides" hidden></div>
                <div class="txe-crop" id="txeCrop" hidden></div>
                <div class="txe-annsel" id="txeAnnSel" hidden></div>
                <div class="txe-ring" id="txeRing" hidden></div>
                <div class="txe-wipe" id="txeWipe" hidden><i></i></div>
                <div class="txe-orig-tag" id="txeOrigTag" hidden>${t('label_original', 'Original')}</div>
                <i class="txe-mark txe-mark-tl"></i><i class="txe-mark txe-mark-tr"></i>
                <i class="txe-mark txe-mark-bl"></i><i class="txe-mark txe-mark-br"></i>
              </div>
            </div>
            <figure class="txe-sbs" id="txeSbs" hidden>
              <canvas id="txeCvSide" aria-label="${t('label_original', 'Original')}"></canvas>
              <figcaption>${t('label_original', 'Original')}</figcaption>
            </figure>
            <div class="txe-drop-hint" id="txeDropHint" hidden>${t('hint_drop', 'Drop an image to load it')}</div>
          </div>

          <div class="txe-side">
            <div class="txe-pane" data-pane="blur">
              <div class="txe-row"><span>${t('lbl_size', 'Size')}</span><input id="txeSize" class="txe-range" type="range" min="12" max="600" value="140"><b id="txeSizeV">140</b></div>
              <div class="txe-row"><span>${t('lbl_strength', 'Strength')}</span><input id="txeStr" class="txe-range" type="range" min="4" max="60" value="18"><b id="txeStrV">18%</b></div>
              <div class="txe-seg" id="txeModeSeg">
                <button type="button" data-m="blur" class="on">${t('mode_blur', 'Blur')}</button>
                <button type="button" data-m="pixelate">${t('mode_pixelate', 'Pixelate')}</button>
              </div>
              <p>${t('hint_blur', 'Drag over faces, plates or text. Click once for a dab.')}</p>
              <button type="button" class="txe-btn" data-act="faceBlur" id="txeFaceBtn">${ic('face')}${t('act_face_blur', 'Blur faces')}</button>
              <button type="button" class="txe-link" data-act="clearBlur">${t('clear_blur', 'Clear all blur')}</button>
            </div>

            <div class="txe-pane txe-off" data-pane="mark">
              <div class="txe-seg" id="txeMarkShapes"></div>
              <div class="txe-row" id="txeMarkTextRow"><span>${t('lbl_text', 'Text')}</span><input id="txeMarkText" class="txe-input" type="text" maxlength="120" placeholder="${t('ph_text', 'Type a caption')}"></div>
              <div class="txe-row"><span>${t('lbl_color', 'Color')}</span><div class="txe-swatches" id="txeMarkColors"></div></div>
              <div class="txe-row" id="txeMarkSizeRow"><span>${t('lbl_size', 'Size')}</span><input id="txeMarkSize" class="txe-range" type="range" min="16" max="200" value="48"><b id="txeMarkSizeV">48</b></div>
              <div class="txe-row" id="txeMarkWidthRow"><span>${t('lbl_width', 'Width')}</span><input id="txeMarkWidth" class="txe-range" type="range" min="2" max="28" value="6"><b id="txeMarkWidthV">6</b></div>
              <div class="txe-seg" id="txeMarkBgSeg">
                <button type="button" data-bg="none" class="on">${t('mark_nobg', 'No chip')}</button>
                <button type="button" data-bg="chip">${t('mark_bg', 'Chip')}</button>
              </div>
              <p>${t('hint_mark', 'Choose a shape, then draw on the photo. Drag text to reposition it.')}</p>
              <div class="txe-btnrow">
                <button type="button" class="txe-btn" data-act="deleteAnn">${t('act_delete_mark', 'Delete selected')}</button>
                <button type="button" class="txe-link" data-act="clearAnnotations">${t('clear_marks', 'Clear marks')}</button>
              </div>
            </div>

            <div class="txe-pane txe-off" data-pane="crop">
              <div class="txe-seg" id="txePresetSeg"></div>
              <div class="txe-btnrow">
                <button type="button" class="txe-btn primary" data-act="applyCrop">${ic('check')}${t('act_apply_crop', 'Apply crop')}</button>
                <button type="button" class="txe-btn" data-act="autoCrop">${ic('auto')}${t('act_auto_crop', 'Auto')}</button>
                <button type="button" class="txe-btn" data-act="clearCrop">${t('act_clear', 'Clear')}</button>
              </div>
              <p>${t('hint_crop', 'Drag on the photo to select an area, or use Auto for the largest crop of the chosen shape.')}</p>
            </div>

            <div class="txe-pane txe-off" data-pane="adjust">
              <div class="txe-seg" id="txeFiltSeg">
                <button type="button" data-f="normal" class="on">${t('filter_normal', 'Normal')}</button>
                <button type="button" data-f="vivid">${t('filter_vivid', 'Vivid')}</button>
                <button type="button" data-f="bw">${t('filter_bw', 'B&W')}</button>
                <button type="button" data-f="warm">${t('filter_warm', 'Warm')}</button>
                <button type="button" data-f="cold">${t('filter_cold', 'Cold')}</button>
                <button type="button" data-f="fade">${t('filter_fade', 'Fade')}</button>
              </div>
              <div class="txe-row"><span>${t('lbl_bright', 'Bright')}</span><input data-f="brightness" class="txe-range" type="range" min="0" max="200" value="100"><b data-v="brightness">100</b></div>
              <div class="txe-row"><span>${t('lbl_contrast', 'Contrast')}</span><input data-f="contrast" class="txe-range" type="range" min="0" max="200" value="100"><b data-v="contrast">100</b></div>
              <div class="txe-row"><span>${t('lbl_sat', 'Satur.')}</span><input data-f="saturate" class="txe-range" type="range" min="0" max="200" value="100"><b data-v="saturate">100</b></div>
              <div class="txe-row"><span>${t('lbl_gray', 'Gray')}</span><input data-f="grayscale" class="txe-range" type="range" min="0" max="100" value="0"><b data-v="grayscale">0</b></div>
              <div class="txe-row"><span>${t('lbl_sepia', 'Sepia')}</span><input data-f="sepia" class="txe-range" type="range" min="0" max="100" value="0"><b data-v="sepia">0</b></div>
              <div class="txe-row"><span>${t('lbl_hue', 'Hue')}</span><input data-f="hue" class="txe-range" type="range" min="-180" max="180" value="0"><b data-v="hue">0</b></div>
              <div class="txe-recipes">
                <select id="txeRecipeSel" aria-label="${t('label_recipes', 'Saved looks')}"><option value="">${t('recipe_none', 'No saved look')}</option></select>
                <div class="txe-btnrow">
                  <input id="txeRecipeName" class="txe-input" type="text" maxlength="24" placeholder="${t('ph_recipe', 'Name this look')}">
                  <button type="button" class="txe-btn" data-act="saveRecipe">${t('act_save_recipe', 'Save')}</button>
                  <button type="button" class="txe-btn" data-act="deleteRecipe" title="${t('act_delete_recipe', 'Delete selected look')}">${t('act_delete', 'Delete')}</button>
                </div>
              </div>
              <button type="button" class="txe-link" data-act="resetFilters">${t('reset_filters', 'Reset filters')}</button>
            </div>

            <div class="txe-pane txe-off" data-pane="rotate">
              <div class="txe-btnrow">
                <button type="button" class="txe-btn" data-act="rotL">⟲ 90°</button>
                <button type="button" class="txe-btn" data-act="rotR">⟳ 90°</button>
              </div>
              <div class="txe-btnrow">
                <button type="button" class="txe-btn" data-act="flipH">⇋ ${t('act_flip_h', 'Flip H')}</button>
                <button type="button" class="txe-btn" data-act="flipV">⇅ ${t('act_flip_v', 'Flip V')}</button>
              </div>
              <div class="txe-row"><span>${t('lbl_angle', 'Angle')}</span><input id="txeAngle" class="txe-range" type="range" min="0" max="359" value="0"><b id="txeAngleV">0°</b></div>
              <button type="button" class="txe-btn" data-act="fitCorners">${ic('fit')}${t('act_fit_corners', 'Fit corners')}</button>
              <p>${t('hint_rotate', 'Use the buttons for quarter turns or the slider to straighten, then fit the corners.')}</p>
            </div>
          </div>
        </div>

        <div class="txe-foot">
          <div class="txe-export" id="txeExport" hidden>
            <label>${t('lbl_format', 'Format')}
              <select id="txeFmt">
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            <label>${t('lbl_quality', 'Quality')} <input id="txeQ" class="txe-range" type="range" min="40" max="100" value="92"><b id="txeQV">92</b></label>
            <label>${t('lbl_max_size', 'Max size')}
              <select id="txeMax">
                <option value="0">${t('size_original', 'Original')}</option>
                <option value="4096">4096 px</option>
                <option value="2048">2048 px</option>
                <option value="1080">1080 px</option>
              </select>
            </label>
            <button type="button" class="txe-btn" data-act="fitX" title="${t('title_fit_x', 'Lower quality until the image is under 5 MB')}">${t('act_fit_x', 'Fit under 5 MB')}</button>
            <button type="button" class="txe-btn" data-act="copy">${ic('copy')}${t('act_copy', 'Copy')}</button>
          </div>
          <div class="txe-footmain">
            <div class="txe-statuswrap">
              <span class="txe-status" id="txeStatus" role="status" aria-live="polite">${t('status_ready', 'Ready')}</span>
              <span class="txe-estimate" id="txeEstimate"></span>
            </div>
            <div class="txe-footbtns">
              <button type="button" class="txe-btn" data-act="exportToggle" title="${t('title_export', 'Output format and size')}">${ic('export')}${t('act_export', 'Export')}</button>
              ${allowDownload ? `<button type="button" class="txe-btn" data-act="download" title="${t('title_download', 'Download (Ctrl/⌘+S)')}">${ic('download')}${t('act_download', 'Download')}</button>` : ''}
              ${showSave ? `<button type="button" class="txe-btn primary" data-act="save">${ic('check')}<span class="txe-btn-label">${saveLabel}</span></button>` : ''}
            </div>
          </div>
        </div>
      </div>`;

    (opts.mount || document.body).appendChild(root);

    const ui = {
      root,
      card: root.querySelector('.txe-card'),
      cv: root.querySelector('#txeCv'),
      cvWipe: root.querySelector('#txeCvWipe'),
      fx: root.querySelector('#txeCvFx'),
      cvSide: root.querySelector('#txeCvSide'),
      sbs: root.querySelector('#txeSbs'),
      wipe: root.querySelector('#txeWipe'),
      box: root.querySelector('#txeBox'),
      plate: root.querySelector('#txePlate'),
      rulerX: root.querySelector('#txeRulerX'),
      rulerY: root.querySelector('#txeRulerY'),
      selX: root.querySelector('#txeSelX'),
      selY: root.querySelector('#txeSelY'),
      guides: root.querySelector('#txeGuides'),
      origTag: root.querySelector('#txeOrigTag'),
      crop: root.querySelector('#txeCrop'),
      annSel: root.querySelector('#txeAnnSel'),
      ring: root.querySelector('#txeRing'),
      dropHint: root.querySelector('#txeDropHint'),
      status: root.querySelector('#txeStatus'),
      estimate: root.querySelector('#txeEstimate'),
      dims: root.querySelector('#txeDims'),
      exportRow: root.querySelector('#txeExport'),
      saveBtn: root.querySelector('[data-act="save"]'),
      faceBtn: root.querySelector('#txeFaceBtn'),
    };

    /* ------------------------------------------------------------- widgets */

    function buildSwatches(host, colors, onPick) {
      for (const c of colors) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'txe-swatch';
        b.dataset.color = c;
        b.title = c === '#ffffff' ? 'White' : c === '#000000' ? 'Black' : c;
        b.style.background = c;
        b.addEventListener('click', () => onPick(c));
        host.appendChild(b);
      }
    }
    buildSwatches(root.querySelector('#txeMarkColors'), MARK_COLORS, (c) => {
      mark.color = c;
      persist();
      syncControls();
      if (selectedAnn >= 0) {
        core.pushHistory();
        core.updateAnnotation(selectedAnn, { color: c });
        render();
      }
    });

    for (const s of MARK_SHAPES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.shape = s;
      b.textContent = t('mark_' + s, s[0].toUpperCase() + s.slice(1));
      root.querySelector('#txeMarkShapes').appendChild(b);
    }
    for (const [key, label] of [
      ['free', 'Free'],
      ['1:1', '1:1'],
      ['4:5', '4:5'],
      ['16:9', '16:9'],
      ['3:2', '3:2'],
      ['4:3', '4:3'],
      ['9:16', '9:16'],
      ['1.91:1', '1.91:1'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.p = key;
      b.textContent = label;
      root.querySelector('#txePresetSeg').appendChild(b);
    }

    /* ------------------------------------------------------------- helpers */

    const minSide = () => Math.max(1, Math.min(core.imgW || 1, core.imgH || 1));
    const strengthPx = () => Math.max(3, Math.round((brush.strengthPct / 100) * minSide() * 0.5));
    const status = (s) => {
      if (ui.status) ui.status.textContent = s;
    };
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => [...root.querySelectorAll(sel)];

    function updateRangeFill(el) {
      if (!el) return;
      const min = Number(el.min) || 0;
      const max = Number(el.max);
      const span = Number.isFinite(max) && max !== min ? max - min : 100;
      el.style.setProperty('--fill', Math.max(0, Math.min(100, ((Number(el.value) - min) / span) * 100)) + '%');
    }

    function toast(msg) {
      if (opts.onToast) return opts.onToast(msg);
      let el = document.querySelector('.txe-toast');
      if (!el) {
        el = document.createElement('div');
        el.className = 'txe-toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(el.__txeTimer);
      el.__txeTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }

    function persist() {
      prefs.brush.strengthPct = brush.strengthPct;
      prefs.brush.mode = brush.mode;
      prefs.mark = { ...mark };
      savePrefs(prefs);
    }

    function applyTheme() {
      const dark = resolveDark(prefs.theme);
      root.classList.toggle('txe-light', !dark);
      if (mode === 'inline') document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    }

    /* ---------------------------------------------------------- rendering */

    function niceStep(total, target = 6) {
      const raw = total / target;
      const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
      const n = raw / pow;
      const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
      return Math.max(1, Math.round(mult * pow));
    }

    function buildRuler(host, total, axis) {
      host.querySelectorAll('.txe-ruler-tick').forEach((n) => n.remove());
      if (!total) return;
      const step = niceStep(total);
      const frag = document.createDocumentFragment();
      for (let v = 0; v <= total + 0.5; v += step) {
        const tick = document.createElement('span');
        tick.className = 'txe-ruler-tick';
        if (axis === 'x') tick.style.left = (v / total) * 100 + '%';
        else tick.style.top = (v / total) * 100 + '%';
        const line = document.createElement('i');
        const label = document.createElement('b');
        label.textContent = String(Math.round(v));
        tick.append(line, label);
        frag.appendChild(tick);
      }
      host.appendChild(frag);
    }

    function updateSelection(rect) {
      if (!meta || !rect) {
        root.classList.remove('txe-selecting');
        return;
      }
      root.classList.add('txe-selecting');
      ui.selX.style.left = (rect.x / meta.fullW) * 100 + '%';
      ui.selX.style.width = (rect.w / meta.fullW) * 100 + '%';
      ui.selY.style.top = (rect.y / meta.fullH) * 100 + '%';
      ui.selY.style.height = (rect.h / meta.fullH) * 100 + '%';
    }

    // Keep a stage overlay canvas pixel-aligned with the edited canvas.
    function syncStageCanvas(canvas, clear = true) {
      if (!meta) return null;
      const cr = ui.cv.getBoundingClientRect();
      const pr = ui.plate.getBoundingClientRect();
      canvas.hidden = false;
      canvas.style.width = cr.width + 'px';
      canvas.style.height = cr.height + 'px';
      canvas.style.left = cr.left - pr.left + 'px';
      canvas.style.top = cr.top - pr.top + 'px';
      if (canvas.width !== ui.cv.width || canvas.height !== ui.cv.height) {
        canvas.width = ui.cv.width;
        canvas.height = ui.cv.height;
      }
      if (clear) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      return canvas;
    }

    // The compare overlay only shows the *original*, which changes with crop /
    // rotation / flip — not with filters — so re-rendering it on every slider
    // tick would be wasted work.
    function geometrySignature() {
      const c = core.crop;
      return [core.rotation, core.flipH, core.flipV, c ? `${c.x}|${c.y}|${c.w}|${c.h}` : 'full'].join(':');
    }

    function render() {
      if (!core.loaded) return;
      // match the preview to the space we actually have, capped for quality
      const dpr = window.devicePixelRatio || 1;
      const target = Math.min(1400, Math.max(800, Math.ceil((ui.box.clientWidth || 720) * dpr)));
      meta = core.render(ui.cv, target, { effects: !showOriginal, original: showOriginal });
      syncStageCanvas(ui.fx);
      ui.dims.textContent = `${meta.fullW}×${meta.fullH}`;
      buildRuler(ui.rulerX, meta.fullW, 'x');
      buildRuler(ui.rulerY, meta.fullH, 'y');
      ui.origTag.hidden = !showOriginal;
      hideOverlays();
      // a render (filter tweak, undo…) must not silently drop a pending crop
      if (cropDrag) drawCropOverlay();
      drawAnnotationSelection();
      updateHistoryButtons();
      const sig = geometrySignature();
      const geomChanged = sig !== lastGeometrySig;
      lastGeometrySig = sig;
      updateCompare(geomChanged);
      // encoding is expensive — only estimate when the export panel is open
      if (!ui.exportRow.hidden) scheduleEstimate();
    }

    function scheduleRender() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        render();
      });
    }

    function updateHistoryButtons() {
      const u = $('[data-act="undo"]');
      const r = $('[data-act="redo"]');
      if (u) u.disabled = !core.canUndo();
      if (r) r.disabled = !core.canRedo();
    }

    function hideOverlays() {
      ui.crop.hidden = true;
      if (ui.ring) ui.ring.hidden = true;
      updateSelection(null);
    }

    // The canvas cursor always reflects the active tool — compare is an overlay
    // and must never make the editor feel disabled.
    function setEditorCursor() {
      ui.cv.style.cursor =
        tool === 'blur' ? 'none' : tool === 'adjust' || tool === 'rotate' ? 'default' : 'crosshair';
    }

    // Dashed outline around the selected mark, in output space.
    function drawAnnotationSelection() {
      if (!meta || tool !== 'mark' || selectedAnn < 0) {
        ui.annSel.hidden = true;
        return;
      }
      const b = core.annotationBounds(selectedAnn);
      if (!b) {
        ui.annSel.hidden = true;
        return;
      }
      const corners = [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h],
      ].map(([sx, sy]) => {
        const base = core.srcToBase(sx, sy);
        return core.baseToOutput(base.x, base.y);
      });
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      placeOverlay(ui.annSel, x, y, Math.max(...xs) - x, Math.max(...ys) - y);
    }

    function placeOverlay(el, x, y, w, h, cssColor) {
      if (!meta) return;
      const cr = ui.cv.getBoundingClientRect();
      const br = ui.plate.getBoundingClientRect();
      const s = cr.width / meta.fullW;
      el.hidden = false;
      el.style.left = cr.left - br.left + x * s + 'px';
      el.style.top = cr.top - br.top + y * s + 'px';
      el.style.width = w * s + 'px';
      el.style.height = h * s + 'px';
      if (cssColor) el.style.background = cssColor;
    }

    /* ------------------------------------------------------------- compare */

    function setCompare(next) {
      compareMode = next;
      const on = compareMode !== 'off';
      $('[data-act="compare"]').classList.toggle('on', on);
      ui.wipe.hidden = compareMode !== 'wipe';
      ui.sbs.hidden = compareMode !== 'side';
      root.classList.toggle('txe-cmp-side', compareMode === 'side');
      // Compare is an overlay, not a mode: keep editing exactly as before.
      setEditorCursor();
      updateCompare();
      status(
        compareMode === 'wipe'
          ? t('status_compare_wipe', 'Drag the ball left / right to compare — you can keep editing.')
          : compareMode === 'side'
            ? t('status_compare_side', 'Side by side — you can keep editing.')
            : t('status_ready', 'Ready')
      );
    }

    function cycleCompare() {
      setCompare(compareMode === 'off' ? 'wipe' : compareMode === 'wipe' ? 'side' : 'off');
    }

    // `force` re-encodes the original; otherwise it is only re-rendered when the
    // geometry (crop / rotate / flip) actually changed — filter ticks skip it.
    function updateCompare(force = true) {
      if (!core.loaded || !meta) return;
      const sig = geometrySignature();

      if (compareMode === 'wipe') {
        syncStageCanvas(ui.cvWipe, false);
        if (force || wipeSig !== sig) {
          // `original` also drops the colour filters, not just blur/marks
          core.render(ui.cvWipe, Math.max(meta.cw, meta.ch), { effects: false, original: true });
          wipeSig = sig;
        }
        ui.cvWipe.style.clipPath = `inset(0 ${(1 - wipePos) * 100}% 0 0)`;
        ui.wipe.style.left = wipePos * 100 + '%';
      } else {
        ui.cvWipe.hidden = true;
        wipeSig = null;
      }

      if (compareMode === 'side') {
        if (force || sideSig !== sig) {
          core.render(ui.cvSide, Math.max(meta.cw, meta.ch), { effects: false, original: true });
          sideSig = sig;
        }
        // let the CSS halve both plates; no inline size so the aspect holds
        ui.cvSide.style.width = '';
        ui.cvSide.style.height = '';
      } else {
        sideSig = null;
      }
    }

    /* ---------------------------------------------------------- export size */

    function currentExportParams() {
      const out = core.outputSize();
      const maxDim = prefs.export.maxDim > 0 ? prefs.export.maxDim : Math.max(out.w, out.h);
      return {
        maxDim,
        type: prefs.export.type,
        quality: Math.max(0.4, Math.min(1, prefs.export.quality / 100)),
      };
    }

    async function currentExport() {
      const p = currentExportParams();
      const blob = await core.exportBlob(p);
      return { blob, filename: `${downloadName}.${Core.extFor(p.type)}` };
    }

    function scheduleEstimate() {
      if (!ui.estimate) return;
      clearTimeout(estimateTimer);
      estimateTimer = setTimeout(runEstimate, 420);
    }

    async function runEstimate() {
      if (!core.loaded) {
        ui.estimate.textContent = '';
        return;
      }
      const token = ++estimateToken;
      ui.estimate.textContent = '…';
      try {
        const { blob } = await currentExport();
        if (token !== estimateToken || !blob) return;
        const over = blob.size > X_MAX_BYTES;
        ui.estimate.textContent = `≈ ${fmtBytes(blob.size)}`;
        ui.estimate.classList.toggle('over', over);
        ui.estimate.title = over ? t('estimate_over', 'Over the 5 MB X limit — try Fit under 5 MB') : '';
      } catch {
        ui.estimate.textContent = '';
      }
    }

    async function fitUnderX() {
      if (!core.loaded) return;
      status(t('status_fitting', 'Finding the best size under 5 MB…'));
      const out = core.outputSize();
      let maxDim = prefs.export.maxDim > 0 ? prefs.export.maxDim : Math.max(out.w, out.h);
      let quality = prefs.export.quality;
      if (prefs.export.type === 'image/png') {
        prefs.export.type = 'image/jpeg';
        quality = Math.max(quality, 90);
      }
      let blob = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        for (quality = 92; quality >= 50; quality -= 6) {
          blob = await core.exportBlob({ maxDim, type: prefs.export.type, quality: quality / 100 });
          if (blob && blob.size <= X_MAX_BYTES) break;
        }
        if (blob && blob.size <= X_MAX_BYTES) break;
        maxDim = Math.round(maxDim * 0.8);
      }
      prefs.export.quality = Math.max(40, Math.min(100, Math.round(quality)));
      prefs.export.maxDim = maxDim >= Math.max(out.w, out.h) ? 0 : maxDim;
      savePrefs(prefs);
      syncControls();
      await runEstimate();
      status(blob && blob.size <= X_MAX_BYTES ? t('status_fit_ok', 'Ready to post — under 5 MB') : t('status_fit_fail', 'Still over 5 MB — try a smaller max size'));
    }

    async function copyToClipboard() {
      if (!core.loaded) return;
      try {
        const { blob } = await currentExport();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast(t('toast_copied', 'Copied to clipboard'));
      } catch {
        toast(t('toast_copy_failed', 'Could not copy — try Download'));
      }
    }

    /* -------------------------------------------------------------- controls */

    function syncControls() {
      const sizeMax = Math.max(120, Math.min(2000, Math.round(minSide() * 0.9)));
      const size = $('[id="txeSize"]');
      if (size) {
        size.max = sizeMax;
        brush.size = Math.max(+size.min, Math.min(brush.size, sizeMax));
        size.value = brush.size;
        $('[id="txeSizeV"]').textContent = brush.size;
      }
      const str = $('[id="txeStr"]');
      if (str) {
        str.value = brush.strengthPct;
        $('[id="txeStrV"]').textContent = brush.strengthPct + '%';
      }
      $$('#txeModeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === brush.mode));

      $$('#txeMarkShapes button').forEach((b) => b.classList.toggle('on', b.dataset.shape === mark.shape));
      $$('#txeMarkColors .txe-swatch').forEach((b) => b.classList.toggle('on', b.dataset.color === mark.color));
      $$('#txeMarkBgSeg button').forEach((b) =>
        b.classList.toggle('on', (b.dataset.bg === 'chip') === !!mark.bg)
      );
      // marks are sized in source pixels, so the useful range depends on the
      // photo — scale it like the blur brush does
      const side = minSide();
      const mkSize = $('[id="txeMarkSize"]');
      if (mkSize) {
        mkSize.max = Math.max(120, Math.min(900, Math.round(side * 0.5)));
        mark.size = Math.max(+mkSize.min, Math.min(mark.size, +mkSize.max));
        mkSize.value = mark.size;
        $('[id="txeMarkSizeV"]').textContent = mark.size;
      }
      const mkWidth = $('[id="txeMarkWidth"]');
      if (mkWidth) {
        mkWidth.max = Math.max(20, Math.min(160, Math.round(side * 0.05)));
        mark.width = Math.max(+mkWidth.min, Math.min(mark.width, +mkWidth.max));
        mkWidth.value = mark.width;
        $('[id="txeMarkWidthV"]').textContent = mark.width;
      }
      const isText = mark.shape === 'text';
      const isBox = mark.shape === 'box';
      const bgBtns = $$('#txeMarkBgSeg button');
      if (bgBtns[0] && bgBtns[1]) {
        bgBtns[0].textContent = isText ? t('mark_nobg', 'No chip') : t('mark_outline', 'Outline');
        bgBtns[1].textContent = isText ? t('mark_bg', 'Chip') : t('mark_filled', 'Filled');
      }
      $('[id="txeMarkSizeRow"]').hidden = !isText;
      $('[id="txeMarkWidthRow"]').hidden = isText;
      $('[id="txeMarkTextRow"]').hidden = !isText;
      $('[id="txeMarkBgSeg"]').hidden = !(isText || isBox);
      const mkText = $('[id="txeMarkText"]');
      if (mkText) mkText.value = selectedAnn >= 0 && core.annotations[selectedAnn] ? core.annotations[selectedAnn].text || '' : mark.text || '';

      $$('input[data-f]').forEach((i) => {
        i.value = core.filters[i.dataset.f];
        const v = $(`[data-v="${i.dataset.f}"]`);
        if (v) v.textContent = core.filters[i.dataset.f];
      });

      const angle = $('[id="txeAngle"]');
      if (angle) {
        angle.value = Math.round(core.rotation);
        $('[id="txeAngleV"]').textContent = Math.round(core.rotation) + '°';
      }

      $$('#txePresetSeg button').forEach((b) => b.classList.toggle('on', b.dataset.p === preset));
      const match = Object.entries(FILTER_PRESETS).find(([, f]) =>
        Object.keys(f).every((k) => f[k] === core.filters[k] || (f[k] === 0 && !core.filters[k]))
      );
      $$('#txeFiltSeg button').forEach((b) => b.classList.toggle('on', match && b.dataset.f === match[0]));

      const fmt = $('[id="txeFmt"]');
      if (fmt) fmt.value = prefs.export.type;
      const q = $('[id="txeQ"]');
      if (q) {
        q.value = prefs.export.quality;
        $('[id="txeQV"]').textContent = prefs.export.quality;
      }
      const max = $('[id="txeMax"]');
      if (max) max.value = String(prefs.export.maxDim);

      const sel = $('[id="txeRecipeSel"]');
      if (sel) {
        const current = sel.value;
        sel.innerHTML = `<option value="">${t('recipe_none', 'No saved look')}</option>`;
        recipes.forEach((r, i) => {
          const o = document.createElement('option');
          o.value = String(i);
          o.textContent = r.name;
          sel.appendChild(o);
        });
        sel.value = recipes[current] ? current : '';
      }

      $$('.txe-range').forEach(updateRangeFill);
      updateHistoryButtons();
    }

    function setTool(next) {
      tool = TOOLS.includes(next) ? next : 'blur';
      $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
      $$('.txe-pane').forEach((p) => p.classList.toggle('txe-off', p.dataset.pane !== tool));
      setEditorCursor();
      ui.guides.hidden = tool !== 'crop';
      hideOverlays();
      const hints = {
        blur: t('status_hint_blur', 'Drag on the photo to blur. Strokes apply on release.'),
        mark: t('status_hint_mark', 'Pick a shape, then draw. Drag text to move it.'),
        crop: t('status_hint_crop', 'Drag on the photo, then apply to crop.'),
        adjust: t('status_hint_adjust', 'Tune light and colour, or save the look as a recipe.'),
        rotate: t('status_hint_rotate', 'Straighten, flip, then fit the corners.'),
      };
      status(hints[tool] || t('status_ready', 'Ready'));
      // Keep a pending crop selection alive when you switch away and back —
      // only the overlay is hidden, so "select → check Adjust → Apply" works.
      if (tool === 'crop' && cropDrag) drawCropOverlay();
      drawAnnotationSelection();
    }

    /* ---------------------------------------------------------- pointer logic */

    function rel(e) {
      const r = ui.cv.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
    }
    function outPt(e) {
      const p = rel(e);
      return core.toOutput(p.x, p.y);
    }

    function liveDab(pt, stroke) {
      if (!meta) return;
      const k = meta.cw / meta.fullW;
      // drawn on the feedback layer so strokes stay visible above the compare
      // overlay while you paint
      const ctx = ui.fx.getContext('2d');
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x * k, pt.y * k, Math.max(1, (stroke.size * k) / 2), 0, Math.PI * 2);
      ctx.fillStyle = stroke.mode === 'pixelate' ? 'rgba(29,155,240,.5)' : 'rgba(255,255,255,.55)';
      ctx.fill();
      ctx.restore();
    }

    function sizeRing() {
      if (!meta || tool !== 'blur') return;
      const r = ui.cv.getBoundingClientRect();
      const d = Math.max(8, brush.size * (r.width / meta.fullW));
      ui.ring.style.width = ui.ring.style.height = d + 'px';
    }
    function moveRing(e) {
      if (!meta) return;
      sizeRing();
      const pr = ui.plate.getBoundingClientRect();
      const d = parseFloat(ui.ring.style.width) / 2 || 20;
      ui.ring.hidden = false;
      ui.ring.style.left = e.clientX - pr.left - d + 'px';
      ui.ring.style.top = e.clientY - pr.top - d + 'px';
    }

    // The single source of truth for the pending crop: derived from the raw
    // drag on every use, so applying never depends on a previous draw pass.
    function cropRectPx() {
      if (!cropDrag || !meta || !meta.fullW || !meta.fullH) return null;
      const pr = PRESETS[preset];
      const rel = Core.cropRectRel(cropDrag, meta.fullW, meta.fullH, pr && pr.ratio ? pr.ratio : null);
      return {
        rel,
        px: { x: rel.x * meta.fullW, y: rel.y * meta.fullH, w: rel.w * meta.fullW, h: rel.h * meta.fullH },
      };
    }

    function drawCropOverlay() {
      const r = cropRectPx();
      if (!r) {
        ui.crop.hidden = true;
        if (!cropDrag) updateSelection(null);
        return;
      }
      cropDrag.norm = r.rel;
      placeOverlay(ui.crop, r.px.x, r.px.y, r.px.w, r.px.h);
      updateSelection(r.px);
      status(`${t('status_selection', 'Selection')} ${Math.round(r.px.w)}×${Math.round(r.px.h)}`);
    }

    function ensureHistory(obj) {
      if (!obj.__hist) {
        core.pushHistory();
        obj.__hist = true;
      }
    }

    function onPointerDown(e) {
      if (!core.loaded) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try {
        ui.cv.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (tool === 'blur') {
        painting = { points: [outPt(e)], size: brush.size, strength: strengthPx(), mode: brush.mode };
      } else if (tool === 'crop') {
        const p = rel(e);
        cropDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        cropping = true;
        drawCropOverlay();
      } else if (tool === 'mark') {
        const p = outPt(e);
        // grabbing an existing mark (any type) moves it instead of drawing
        const src = core.outputToSource(p.x, p.y);
        const hit = core.hitTestAnnotation(src, 0);
        if (hit >= 0) {
          selectedAnn = hit;
          draggingAnn = { index: hit, last: src, moved: false };
          draggingAnn.snapshot = core.annotations[hit].pts.map((q) => ({ ...q }));
          syncControls();
          render();
          return;
        }
        if (mark.shape === 'text') {
          core.pushHistory();
          core.addAnnotation({
            type: 'text',
            pts: [p],
            text: mark.text || t('mark_default_text', 'Text'),
            color: mark.color,
            size: mark.size,
            bg: mark.bg,
          });
          selectedAnn = core.annotations.length - 1;
          markDrag = { __noop: true };
          syncControls();
          render();
          const input = $('[id="txeMarkText"]');
          if (input) {
            input.focus();
            input.select();
          }
          return;
        }
        markDrag = {
          points: [p],
          shape: mark.shape,
          color: mark.color,
          width: mark.width,
          size: mark.size,
          bg: mark.bg,
        };
      }
    }

    function onPointerMove(e) {
      if (!core.loaded) return;
      if (tool === 'blur') moveRing(e);
      if (painting) {
        const p = outPt(e);
        painting.points.push(p);
        ensureHistory(painting);
        liveDab(p, painting);
      } else if (cropDrag && cropping) {
        const p = rel(e);
        cropDrag.x1 = p.x;
        cropDrag.y1 = p.y;
        drawCropOverlay();
      } else if (draggingAnn) {
        const o = outPt(e);
        const p = core.outputToSource(o.x, o.y);
        const dx = p.x - draggingAnn.last.x;
        const dy = p.y - draggingAnn.last.y;
        if (dx || dy) {
          if (!draggingAnn.moved) {
            core.pushHistory();
            draggingAnn.moved = true;
          }
          core.moveAnnotation(draggingAnn.index, dx, dy);
          draggingAnn.last = p;
          scheduleRender();
        }
      } else if (tool === 'mark' && !draggingAnn && !markDrag) {
        const o = outPt(e);
        const src = core.outputToSource(o.x, o.y);
        ui.cv.style.cursor = core.hitTestAnnotation(src, 0) >= 0 ? 'move' : 'crosshair';
      }
      if (markDrag && markDrag.points) {
        if (markDrag.shape === 'pen') {
          markDrag.points.push(outPt(e));
        } else {
          markDrag.points[1] = outPt(e);
        }
        ensureHistory(markDrag);
        render();
      }
    }

    function onPointerUp() {
      if (painting) {
        ensureHistory(painting);
        core.pushBlurStroke(painting);
        painting = null;
        render();
        status(t('status_blur_done', 'Blur applied'));
      }
      if (markDrag) {
        if (!markDrag.__noop) {
          const p = markDrag.points;
          const big = markDrag.shape === 'pen' ? p.length > 1 : p.length > 1 && Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) > 8;
          if (big) {
            ensureHistory(markDrag);
            if (markDrag.shape === 'pen') {
              core.addAnnotation({ type: 'pen', pts: p, color: markDrag.color, width: markDrag.width });
            } else if (markDrag.shape === 'arrow') {
              core.addAnnotation({ type: 'arrow', pts: [p[0], p[1]], color: markDrag.color, width: markDrag.width });
            } else {
              const [a, b] = p;
              core.addAnnotation({
                type: 'box',
                pts: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }],
                color: markDrag.color,
                width: markDrag.width,
                // fill follows the stroke colour, so "Filled" gives a solid bar
                bg: markDrag.bg ? markDrag.color : null,
              });
            }
            selectedAnn = core.annotations.length - 1;
            status(t('status_mark_added', 'Mark added'));
          } else if (markDrag.__hist) {
            core.undo();
          }
          render();
        }
        markDrag = null;
      }
      if (draggingAnn) {
        draggingAnn = null;
      }
      cropping = false;
    }

    /* ----------------------------------------------------------- wipe handle */

    let wiping = false;
    function wipeFrom(e) {
      const pr = ui.plate.getBoundingClientRect();
      wipePos = Math.min(1, Math.max(0, (e.clientX - pr.left) / pr.width));
      updateCompare();
    }
    // Grab the ball (or anywhere along the line) to scrub; the rest of the
    // photo stays fully editable while compare is on.
    ui.wipe.addEventListener('pointerdown', (e) => {
      if (compareMode !== 'wipe') return;
      e.preventDefault();
      e.stopPropagation();
      wiping = true;
      try {
        ui.wipe.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      wipeFrom(e);
    });
    ui.wipe.addEventListener('pointermove', (e) => {
      if (wiping) wipeFrom(e);
    });
    ['pointerup', 'pointercancel'].forEach((ev) =>
      ui.wipe.addEventListener(ev, () => {
        wiping = false;
      })
    );

    /* ------------------------------------------------------------ face blur */

    const faceSupported = typeof window.FaceDetector !== 'undefined';
    if (ui.faceBtn && !faceSupported) {
      // keep it clickable so it can explain itself rather than sitting dead
      ui.faceBtn.classList.add('txe-unsupported');
      ui.faceBtn.title = t('face_unavailable', 'Face detection is not available in this browser — use the blur brush instead');
    }

    async function detectFaces() {
      if (!core.loaded) return;
      if (!faceSupported) {
        toast(t('toast_face_unavailable', 'Face detection is not available in this browser — blur faces by hand'));
        return;
      }
      status(t('status_detecting', 'Looking for faces…'));
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 24 });
        const faces = await detector.detect(core.img);
        if (!faces.length) {
          status(t('status_no_faces', 'No faces found'));
          return;
        }
        core.pushHistory();
        for (const f of faces) {
          const box = f.boundingBox;
          const pad = 0.16 * Math.max(box.width, box.height);
          const x = Math.max(0, box.x - pad);
          const y = Math.max(0, box.y - pad);
          const x2 = Math.min(core.imgW, box.x + box.width + pad);
          const y2 = Math.min(core.imgH, box.y + box.height + pad);
          core.addBlurRegionSourceQuad(
            [
              { x, y },
              { x: x2, y },
              { x: x2, y: y2 },
              { x, y: y2 },
            ],
            brush.mode
          );
        }
        render();
        status(`${t('status_faces', 'Faces covered')} (${faces.length})`);
      } catch {
        status(t('status_faces_failed', 'Face detection failed'));
      }
    }

    /* -------------------------------------------------------------- recipes */

    function applyRecipe(index) {
      const r = recipes[index];
      if (!r) return;
      core.pushHistory();
      core.applySettings(r.settings);
      syncControls();
      render();
      status(`${t('status_recipe_applied', 'Applied')} “${r.name}”`);
    }

    function saveRecipe() {
      const input = $('[id="txeRecipeName"]');
      const name = (input && input.value.trim()) || t('recipe_default', 'Look');
      recipes.push({ name, settings: core.getSettings() });
      saveRecipes(recipes);
      if (input) input.value = '';
      syncControls();
      const sel = $('[id="txeRecipeSel"]');
      if (sel) sel.value = String(recipes.length - 1);
      toast(`${t('toast_recipe_saved', 'Saved')} “${name}”`);
    }

    function deleteRecipe() {
      const sel = $('[id="txeRecipeSel"]');
      const i = sel ? Number(sel.value) : NaN;
      if (!Number.isInteger(i) || !recipes[i]) return;
      const [removed] = recipes.splice(i, 1);
      saveRecipes(recipes);
      syncControls();
      toast(`${t('toast_recipe_deleted', 'Deleted')} “${removed.name}”`);
    }

    /* -------------------------------------------------------------- actions */

    async function doDownload() {
      const { blob, filename } = await currentExport();
      if (!blob) return status(t('status_export_failed', 'Export failed'));
      if (opts.onExport) opts.onExport(blob, filename);
      else downloadBlob(blob, filename);
      status(`${t('status_saved', 'Saved')} ${filename}`);
    }

    async function doSave() {
      if (saveBusy) return;
      saveBusy = true;
      if (ui.saveBtn) ui.saveBtn.disabled = true;
      status(t('status_preparing', 'Preparing image…'));
      try {
        const { blob, filename } = await currentExport();
        if (!blob) throw new Error('export failed');
        if (opts.onSave) await opts.onSave({ blob, filename, file: currentFile, ui });
        else {
          downloadBlob(blob, filename);
          status(`${t('status_saved', 'Saved')} ${filename}`);
        }
      } catch (err) {
        status(t('status_export_failed', 'Export failed'));
        console.warn('TweetShot save failed', err);
      } finally {
        saveBusy = false;
        if (ui.saveBtn) ui.saveBtn.disabled = false;
      }
    }

    function rotateTo(deg) {
      const next = ((deg % 360) + 360) % 360;
      if (next === core.rotation) return;
      core.pushHistory();
      core.rotation = next;
      if (core.crop) core.clearCrop();
      cropDrag = null;
      syncControls();
      render();
      status(t('status_rotated', 'Rotated'));
    }

    function handleAct(act) {
      switch (act) {
        case 'close':
          return close();
        case 'undo':
          if (core.undo()) {
            selectedAnn = -1;
            cropDrag = null;
            syncControls();
            render();
            status(t('status_undone', 'Undone'));
          }
          return;
        case 'redo':
          if (core.redo()) {
            selectedAnn = -1;
            cropDrag = null;
            syncControls();
            render();
            status(t('status_redone', 'Redone'));
          }
          return;
        case 'reset':
          core.pushHistory();
          core.resetEdits();
          selectedAnn = -1;
          cropDrag = null;
          syncControls();
          render();
          status(t('status_reset', 'All edits reset'));
          return;
        case 'theme':
          prefs.theme = resolveDark(prefs.theme) ? 'light' : 'dark';
          applyTheme();
          savePrefs(prefs);
          return;
        case 'compare':
          return cycleCompare();
        case 'clearBlur':
          core.pushHistory();
          core.clearBlur();
          render();
          status(t('status_blur_cleared', 'Blur cleared'));
          return;
        case 'clearAnnotations':
          core.pushHistory();
          core.clearAnnotations();
          selectedAnn = -1;
          syncControls();
          render();
          status(t('status_marks_cleared', 'Marks cleared'));
          return;
        case 'deleteAnn':
          if (selectedAnn >= 0) {
            core.pushHistory();
            core.removeAnnotation(selectedAnn);
            selectedAnn = -1;
            syncControls();
            render();
            status(t('status_mark_deleted', 'Mark deleted'));
          } else {
            status(t('status_no_mark', 'Select a text mark first'));
          }
          return;
        case 'clearCrop':
          cropDrag = null;
          if (!core.crop) {
            hideOverlays();
            return;
          }
          core.pushHistory();
          core.clearCrop();
          render();
          status(t('status_crop_cleared', 'Crop cleared'));
          return;
        case 'applyCrop': {
          const r = cropRectPx();
          if (!r || r.px.w < 12 || r.px.h < 12) {
            return status(t('status_drag_first', 'Drag on the photo first'));
          }
          core.pushHistory();
          const c = core.applyCropRel(r.rel);
          cropDrag = null;
          render();
          status(`${t('status_cropped', 'Cropped')} ${Math.round(c.w)}×${Math.round(c.h)}`);
          return;
        }
        case 'autoCrop': {
          const ratio = PRESETS[preset] && PRESETS[preset].ratio ? PRESETS[preset].ratio : null;
          core.pushHistory();
          core.autoCrop(ratio);
          render();
          status(t('status_auto_crop', 'Auto crop applied'));
          return;
        }
        case 'fitCorners':
          core.pushHistory();
          core.fitCorners();
          render();
          status(t('status_fit_corners', 'Corners fitted'));
          return;
        case 'resetFilters':
          core.pushHistory();
          Object.assign(core.filters, window.TXE_DEFAULT_FILTERS);
          syncControls();
          render();
          status(t('status_filters_reset', 'Filters reset'));
          return;
        case 'rotL':
          return rotateTo(core.rotation - 90);
        case 'rotR':
          return rotateTo(core.rotation + 90);
        case 'flipH':
          core.pushHistory();
          core.flipH = !core.flipH;
          render();
          return;
        case 'flipV':
          core.pushHistory();
          core.flipV = !core.flipV;
          render();
          return;
        case 'exportToggle':
          ui.exportRow.hidden = !ui.exportRow.hidden;
          if (!ui.exportRow.hidden) runEstimate();
          return;
        case 'fitX':
          return fitUnderX();
        case 'copy':
          return copyToClipboard();
        case 'faceBlur':
          return detectFaces();
        case 'saveRecipe':
          return saveRecipe();
        case 'deleteRecipe':
          return deleteRecipe();
        case 'download':
          return doDownload();
        case 'save':
          return doSave();
        default:
          return undefined;
      }
    }

    /* ------------------------------------------------------------- wiring */

    root.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tool]');
      if (tb) return setTool(tb.dataset.tool);
      const m = e.target.closest('#txeModeSeg [data-m]');
      if (m) {
        brush.mode = m.dataset.m;
        persist();
        syncControls();
        return;
      }
      const ms = e.target.closest('#txeMarkShapes [data-shape]');
      if (ms) {
        mark.shape = ms.dataset.shape;
        persist();
        syncControls();
        setTool('mark');
        return;
      }
      const mg = e.target.closest('#txeMarkBgSeg [data-bg]');
      if (mg) {
        mark.bg = mg.dataset.bg === 'chip' ? (mark.color === '#000000' || mark.color === '#ffffff' ? '#111111' : '#ffffff') : null;
        persist();
        if (selectedAnn >= 0 && core.annotations[selectedAnn]) {
          const sel = core.annotations[selectedAnn];
          core.pushHistory();
          core.updateAnnotation(selectedAnn, { bg: sel.type === 'box' ? (mark.bg ? sel.color : null) : mark.bg });
          render();
        }
        syncControls();
        return;
      }
      const p = e.target.closest('#txePresetSeg [data-p]');
      if (p) {
        preset = p.dataset.p;
        $$('#txePresetSeg button').forEach((b) => b.classList.toggle('on', b === p));
        if (cropDrag) drawCropOverlay();
        return;
      }
      const f = e.target.closest('#txeFiltSeg [data-f]');
      if (f) {
        core.pushHistory();
        Object.assign(core.filters, FILTER_PRESETS[f.dataset.f]);
        syncControls();
        render();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) handleAct(act.dataset.act);
    });

    const onOriginalDown = (e) => {
      if (e.target.closest('[data-act="original"]')) {
        showOriginal = true;
        render();
      }
    };
    const onOriginalUp = () => {
      if (showOriginal) {
        showOriginal = false;
        scheduleRender();
      }
    };
    root.addEventListener('pointerdown', onOriginalDown);
    window.addEventListener('pointerup', onOriginalUp);

    root.addEventListener('input', (e) => {
      const el = e.target;
      if (el.type === 'range') updateRangeFill(el);
      if (el.id === 'txeSize') {
        brush.size = +el.value;
        $('[id="txeSizeV"]').textContent = el.value;
        sizeRing();
      } else if (el.id === 'txeStr') {
        brush.strengthPct = +el.value;
        $('[id="txeStrV"]').textContent = el.value + '%';
        persist();
      } else if (el.id === 'txeAngle') {
        if (!angleDirty) {
          core.pushHistory();
          angleDirty = true;
        }
        core.rotation = +el.value;
        if (core.crop) core.clearCrop();
        $('[id="txeAngleV"]').textContent = el.value + '°';
        scheduleRender();
      } else if (el.id === 'txeMarkText') {
        mark.text = el.value;
        if (selectedAnn >= 0 && core.annotations[selectedAnn]) {
          core.updateAnnotation(selectedAnn, { text: el.value });
          scheduleRender();
        }
      } else if (el.id === 'txeMarkSize') {
        mark.size = +el.value;
        $('[id="txeMarkSizeV"]').textContent = el.value;
        persist();
        if (selectedAnn >= 0 && core.annotations[selectedAnn]) {
          core.updateAnnotation(selectedAnn, { size: mark.size });
          scheduleRender();
        }
      } else if (el.id === 'txeMarkWidth') {
        mark.width = +el.value;
        $('[id="txeMarkWidthV"]').textContent = el.value;
        persist();
        if (selectedAnn >= 0 && core.annotations[selectedAnn]) {
          core.updateAnnotation(selectedAnn, { width: mark.width });
          scheduleRender();
        }
      } else if (el.id === 'txeQ') {
        prefs.export.quality = +el.value;
        $('[id="txeQV"]').textContent = el.value;
        savePrefs(prefs);
        scheduleEstimate();
      } else if (el.id === 'txeRecipeSel') {
        if (el.value !== '') applyRecipe(Number(el.value));
      } else if (el.dataset.f) {
        if (!sliderDirty.has(el.dataset.f)) {
          core.pushHistory();
          sliderDirty.add(el.dataset.f);
        }
        core.filters[el.dataset.f] = +el.value;
        $(`[data-v="${el.dataset.f}"]`).textContent = el.value;
        scheduleRender();
      }
    });

    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'txeAngle') {
        angleDirty = false;
        syncControls();
      } else if (el.dataset && el.dataset.f) {
        sliderDirty.delete(el.dataset.f);
        syncControls();
      } else if (el.id === 'txeFmt') {
        prefs.export.type = el.value;
        savePrefs(prefs);
        scheduleEstimate();
      } else if (el.id === 'txeMax') {
        prefs.export.maxDim = +el.value;
        savePrefs(prefs);
        scheduleEstimate();
      }
    });

    ui.cv.addEventListener('pointerdown', onPointerDown);
    ui.cv.addEventListener('pointermove', onPointerMove);
    ui.cv.addEventListener('pointerup', onPointerUp);
    ui.cv.addEventListener('pointercancel', onPointerUp);
    ui.cv.addEventListener('pointerleave', () => {
      ui.ring.hidden = true;
    });

    ['dragover', 'dragenter'].forEach((ev) =>
      ui.box.addEventListener(ev, (e) => {
        e.preventDefault();
        ui.dropHint.hidden = false;
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      ui.box.addEventListener(ev, (e) => {
        e.preventDefault();
        ui.dropHint.hidden = true;
      })
    );
    ui.box.addEventListener('drop', (e) => {
      const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) api.open(f);
    });

    /* ------------------------------------------------------------ keyboard */

    function focusables() {
      return [...ui.card.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
    }

    function onKeydown(e) {
      if (!isOpen) return;
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range';
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return close();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
        return;
      }
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        return handleAct(e.shiftKey ? 'redo' : 'undo');
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        return handleAct('redo');
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        return handleAct('save');
      }
      if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        return handleAct('download');
      }
      if (typing) return;
      if (e.key === '[' || e.key === ']') {
        const delta = e.key === ']' ? 1 : -1;
        const step = Math.max(4, Math.round(minSide() * 0.01));
        const el = $('[id="txeSize"]');
        brush.size = Math.max(12, Math.min(+el.max, brush.size + delta * step));
        el.value = brush.size;
        $('[id="txeSizeV"]').textContent = brush.size;
        sizeRing();
        e.preventDefault();
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        showOriginal = !showOriginal;
        render();
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        cycleCompare();
        return;
      }
      const idx = +e.key - 1;
      if (idx >= 0 && idx < TOOLS.length) setTool(TOOLS[idx]);
    }

    /* ----------------------------------------------------------------- API */

    async function load(file) {
      currentFile = file;
      status(t('status_loading', 'Loading…'));
      try {
        await core.loadFile(file);
      } catch {
        status(t('status_load_failed', 'Could not load that image'));
        return false;
      }
      brush.size = Math.max(24, Math.min(Math.round(minSide() * 0.16), 600));
      mark.size = Math.max(18, Math.min(Math.round(minSide() * 0.07), 500));
      mark.width = Math.max(2, Math.min(Math.round(minSide() * 0.012), 60));
      preset = 'free';
      tool = opts.initialTool || 'blur';
      painting = null;
      cropDrag = null;
      markDrag = null;
      selectedAnn = -1;
      syncControls();
      setTool(tool);
      render();
      status(t('status_start', 'Drag to edit, then save. Ctrl/⌘+Z to undo.'));
      return true;
    }

    async function open(file) {
      if (!file) return;
      prefs = await loadPrefs();
      recipes = await loadRecipes();
      applyTheme();
      brush.strengthPct = prefs.brush.strengthPct;
      brush.mode = prefs.brush.mode;
      mark = { ...prefs.mark };

      if (!isOpen) {
        isOpen = true;
        restoreFocus = document.activeElement;
        if (mode === 'modal') {
          prevOverflow = document.body.style.overflow;
          document.body.style.overflow = 'hidden';
        }
      }
      root.classList.add('open');
      const ok = await load(file);
      if (!ok) return;
      ui.card.focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove('open');
      hideOverlays();
      if (mode === 'modal') document.body.style.overflow = prevOverflow ?? '';
      if (restoreFocus && typeof restoreFocus.focus === 'function') {
        try {
          restoreFocus.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
      if (opts.onClose) opts.onClose();
    }

    function onPaste(e) {
      if (!isOpen) return;
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) {
        e.preventDefault();
        api.open(f);
      }
    }

    function destroy() {
      close();
      window.removeEventListener('pointerup', onOriginalUp);
      window.removeEventListener('resize', updateCompare);
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('paste', onPaste);
      root.remove();
    }

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('paste', onPaste);
    window.addEventListener('resize', updateCompare);
    if (mode === 'inline') {
      const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      mq?.addEventListener?.('change', () => {
        if (prefs.theme === 'auto') applyTheme();
      });
    }

    const api = {
      root,
      card: ui.card,
      core,
      open,
      close,
      load,
      render,
      toast,
      setStatus: status,
      setSaveLabel: (txt) => {
        const label = ui.saveBtn && ui.saveBtn.querySelector('.txe-btn-label');
        if (label) label.textContent = txt;
      },
      getSettings: () => core.getSettings(),
      applySettings: (s) => core.applySettings(s),
      getState: () => core.getState(),
      setState: (s) => core.setState(s),
      // restore a saved session: state + controls + render must move together
      applyState: (s) => {
        core.setState(s);
        selectedAnn = -1;
        cropDrag = null;
        syncControls();
        render();
      },
      hasEdits: () => core.hasEdits(),
      setCompare,
      get isOpen() {
        return isOpen;
      },
      destroy,
    };
    return api;
  }

  window.TXECreateEditorUI = createEditorUI;
  window.TXEPrefs = { loadPrefs, savePrefs, loadRecipes, saveRecipes, DEFAULT_PREFS, resolveDark };
})();
