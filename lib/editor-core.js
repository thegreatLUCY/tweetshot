/* TweetShot core v4 — dependency-free canvas engine.
 *
 * Coordinate spaces:
 *   source  = original decoded image pixels (never changes)
 *   base    = source after rotation + flip, sized to the rotated bounding box
 *   output  = base cropped by `crop` (in base pixels)
 *   canvas  = preview/export canvas, output scaled by `k`
 *
 * Everything that should follow the photo as you crop and rotate — blur
 * strokes, blur regions and annotations — is stored in SOURCE pixels. Crop is
 * stored in BASE pixels. That is what makes "blur a face, crop, then rotate"
 * behave the way users expect.
 *
 * No network. No dependencies.
 */

const TXE_DEFAULT_FILTERS = Object.freeze({
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  hue: 0,
});

const TXE_ANNOTATION_TYPES = ['text', 'arrow', 'box', 'pen'];

// The public repo, used by the "star us" links. It is only an <a href>: nothing
// is requested from inside the extension until a person clicks it.
const TXE_REPO_URL = 'https://github.com/thegreatLUCY/tweetshot';

function make2d(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

class TweetImageEditorCore {
  constructor() {
    this.img = null;
    this.imgW = 0;
    this.imgH = 0;
    this.rotation = 0; // degrees, clockwise (any value allowed)
    this.flipH = false;
    this.flipV = false;
    this.filters = { ...TXE_DEFAULT_FILTERS };
    this.crop = null; // { x, y, w, h } in base px
    this.blurStrokes = []; // [{ points:[{x,y}], size, strength, mode }] source px
    this.blurRegions = []; // [{ pts:[4 x {x,y}], mode }] source px — face auto-blur
    this.annotations = []; // [{ type, pts, color, width, size, text, bg }] source px
    this.history = [];
    this.future = [];
    this.maxHistory = 40;
  }

  /* ---------------------------------------------------------------- loading */

  async loadFile(file) {
    this.sourceFile = file;
    this.sourceName = (file && file.name) || 'image';
    const url = URL.createObjectURL(file);
    try {
      await this.loadURL(url);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }
    this._resetEdits();
  }

  getSourceFile() {
    return this.sourceFile || null;
  }

  loadURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.img = img;
        this.imgW = img.naturalWidth;
        this.imgH = img.naturalHeight;
        resolve();
      };
      img.onerror = () => reject(new Error('could not load image'));
      img.src = url;
    });
  }

  get loaded() {
    return !!(this.img && this.imgW && this.imgH);
  }

  resetEdits() {
    this.rotation = 0;
    this.flipH = false;
    this.flipV = false;
    this.filters = { ...TXE_DEFAULT_FILTERS };
    this.crop = null;
    this.blurStrokes = [];
    this.blurRegions = [];
    this.annotations = [];
  }

  _resetEdits() {
    this.resetEdits();
    this.history = [];
    this.future = [];
  }

  hasEdits() {
    const f = this.filters;
    const filtersTouched =
      f.brightness !== 100 || f.contrast !== 100 || f.saturate !== 100 || f.grayscale || f.sepia || f.hue;
    return !!(
      this.rotation ||
      this.flipH ||
      this.flipV ||
      filtersTouched ||
      this.crop ||
      this.blurStrokes.length ||
      this.blurRegions.length ||
      this.annotations.length
    );
  }

  /* --------------------------------------------------------------- geometry */

  _rotRad() {
    return (this.rotation * Math.PI) / 180;
  }

  baseSize() {
    if (!this.loaded) return { w: 0, h: 0 };
    const c = Math.abs(Math.cos(this._rotRad()));
    const s = Math.abs(Math.sin(this._rotRad()));
    return {
      w: Math.max(1, Math.round(this.imgW * c + this.imgH * s)),
      h: Math.max(1, Math.round(this.imgW * s + this.imgH * c)),
    };
  }

  outputSize() {
    if (this.crop) return { w: Math.max(1, Math.round(this.crop.w)), h: Math.max(1, Math.round(this.crop.h)) };
    return this.baseSize();
  }

  _cropOrFull() {
    const base = this.baseSize();
    return this.crop
      ? { x: this.crop.x, y: this.crop.y, w: this.crop.w, h: this.crop.h }
      : { x: 0, y: 0, w: base.w, h: base.h };
  }

  /* source px -> base px */
  srcToBase(sx, sy) {
    const { w: bw, h: bh } = this.baseSize();
    const dx = sx - this.imgW / 2;
    const dy = sy - this.imgH / 2;
    const c = Math.cos(this._rotRad());
    const s = Math.sin(this._rotRad());
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    let bx = bw / 2 + rx;
    let by = bh / 2 + ry;
    if (this.flipH) bx = bw - bx;
    if (this.flipV) by = bh - by;
    return { x: bx, y: by };
  }

  /* base px -> source px */
  baseToSrc(bx, by) {
    const { w: bw, h: bh } = this.baseSize();
    let rx = bx - bw / 2;
    let ry = by - bh / 2;
    if (this.flipH) rx = -rx;
    if (this.flipV) ry = -ry;
    const rad = -this._rotRad();
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return { x: rx * c - ry * s + this.imgW / 2, y: rx * s + ry * c + this.imgH / 2 };
  }

  baseToOutput(bx, by) {
    const c = this._cropOrFull();
    return { x: bx - c.x, y: by - c.y };
  }

  outputToBase(ox, oy) {
    const c = this._cropOrFull();
    return { x: ox + c.x, y: oy + c.y };
  }

  toOutput(x01, y01) {
    const { w, h } = this.outputSize();
    return { x: x01 * w, y: y01 * h };
  }

  // output px -> source px
  outputToSource(ox, oy) {
    const b = this.outputToBase(ox, oy);
    return this.baseToSrc(b.x, b.y);
  }

  /* ---------------------------------------------------------------- filters */

  filterString() {
    const f = this.filters;
    const p = [];
    if (f.brightness !== 100) p.push(`brightness(${f.brightness / 100})`);
    if (f.contrast !== 100) p.push(`contrast(${f.contrast / 100})`);
    if (f.saturate !== 100) p.push(`saturate(${f.saturate / 100})`);
    if (f.grayscale) p.push(`grayscale(${f.grayscale / 100})`);
    if (f.sepia) p.push(`sepia(${f.sepia / 100})`);
    if (f.hue) p.push(`hue-rotate(${f.hue}deg)`);
    return p.length ? p.join(' ') : 'none';
  }

  /* --------------------------------------------------------------- painting */

  // The colour filter for a given render. `original` drops it so compare views
  // show the untouched photo (geometry is still applied so the panes align).
  _baseFilter(opts = {}) {
    return opts.original ? 'none' : this.filterString();
  }

  drawBase(ctx, outW, outH, opts = {}) {
    if (!this.loaded) return;
    const base = this.baseSize();
    const crop = this._cropOrFull();
    const sx = outW / crop.w;
    const sy = outH / crop.h;
    ctx.save();
    ctx.clearRect(0, 0, outW, outH);
    ctx.filter = this._baseFilter(opts);
    ctx.imageSmoothingQuality = 'high';
    const cropCx = crop.x + crop.w / 2;
    const cropCy = crop.y + crop.h / 2;
    ctx.translate(outW / 2, outH / 2);
    ctx.scale(sx, sy);
    ctx.translate(-(cropCx - base.w / 2), -(cropCy - base.h / 2));
    ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
    ctx.rotate(this._rotRad());
    ctx.drawImage(this.img, -this.imgW / 2, -this.imgH / 2, this.imgW, this.imgH);
    ctx.restore();
  }

  _srcToCanvas(sx, sy, k, crop) {
    const b = this.srcToBase(sx, sy);
    return { x: (b.x - crop.x) * k, y: (b.y - crop.y) * k };
  }

  _quadCanvasBounds(pts, k, crop) {
    const c = pts.map((p) => this._srcToCanvas(p.x, p.y, k, crop));
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  render(canvas, maxDim = 1400, opts = {}) {
    if (!this.loaded) return null;
    const { w, h } = this.outputSize();
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    this.compose(ctx, cw, ch, opts);
    return { cw, ch, fullW: w, fullH: h, scale };
  }

  // Draw base + effects onto an already-sized context.
  // opts.effects === false renders the untouched (cropped/rotated) base only.
  compose(ctx, cw, ch, opts = {}) {
    this.drawBase(ctx, cw, ch, opts);
    if (opts.effects === false) return;
    const { w: fullW } = this.outputSize();
    const k = cw / fullW;
    const scratch = this._scratch(ctx, cw, ch, k);
    this._paintDabs(ctx, scratch, k);
    this._paintBlurRegions(ctx, scratch, k);
    this.applyAnnotations(ctx, k);
  }

  /* ----------------------------------------------------------- scratch layers
   * One clean snapshot, one gaussian-blurred copy and one mosaic copy, shared
   * by blur strokes and by face blur regions. Built once per
   * compose instead of once per stroke.
   * -------------------------------------------------------------------------- */

  _scratch(ctx, cw, ch, k) {
    if (!this.blurStrokes.length && !this.blurRegions.length) return null;
    const crop = this._cropOrFull();
    let maxR = 0;
    let maxBlock = 0;

    for (const s of this.blurStrokes) {
      if (s.mode === 'pixelate') maxBlock = Math.max(maxBlock, Math.max(8, Math.round(s.strength * 1.6 * k)));
      else maxR = Math.max(maxR, Math.max(3, Math.round(s.strength * k)));
    }
    for (const r of this.blurRegions) {
      const b = this._quadCanvasBounds(r.pts, k, crop);
      const short = Math.max(1, Math.min(b.w, b.h));
      if (r.mode === 'pixelate') maxBlock = Math.max(maxBlock, Math.max(8, Math.round(short * 0.14)));
      else maxR = Math.max(maxR, Math.max(4, Math.round(short * 0.18)));
    }
    if (!maxR && !maxBlock) return null;

    const clean = make2d(cw, ch);
    clean.getContext('2d').drawImage(ctx.canvas, 0, 0);

    let blurred = null;
    if (maxR > 0) {
      blurred = make2d(cw, ch);
      const b = blurred.getContext('2d');
      b.filter = `blur(${maxR}px)`;
      b.drawImage(clean, 0, 0);
      b.filter = 'none';
    }

    let mosaic = null;
    if (maxBlock > 0) {
      const sw = Math.max(1, Math.round(cw / maxBlock));
      const sh = Math.max(1, Math.round(ch / maxBlock));
      const small = make2d(sw, sh);
      const sctx = small.getContext('2d');
      sctx.imageSmoothingEnabled = false;
      sctx.drawImage(clean, 0, 0, sw, sh);
      mosaic = make2d(cw, ch);
      const mctx = mosaic.getContext('2d');
      mctx.imageSmoothingEnabled = false;
      mctx.drawImage(small, 0, 0, cw, ch);
    }

    return { clean, blurred, mosaic, maxR };
  }

  _paintDabs(ctx, scratch, k) {
    if (!scratch || !this.blurStrokes.length) return;
    const crop = this._cropOrFull();
    const { clean, blurred, mosaic, maxR } = scratch;
    for (const s of this.blurStrokes) {
      const src = s.mode === 'pixelate' ? mosaic : blurred;
      if (!src) continue;
      const r = Math.max(1, (s.size * k) / 2);
      const weak = s.mode !== 'pixelate' && Math.round(s.strength * k) !== maxR;
      for (const p of s.points) {
        const c = this._srcToCanvas(p.x, p.y, k, crop);
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.clip();
        if (weak) {
          ctx.filter = `blur(${Math.max(3, Math.round(s.strength * k))}px)`;
          ctx.drawImage(clean, 0, 0);
          ctx.filter = 'none';
        } else {
          ctx.drawImage(src, 0, 0);
        }
        ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------------ blur regions
   * Rectangular blur/pixelate areas in SOURCE space. Not user-editable — these
   * come from face detection, which needs hard edges rather than brush dabs.
   * -------------------------------------------------------------------------- */

  _paintBlurRegions(ctx, scratch, k) {
    if (!this.blurRegions.length || !scratch) return;
    const crop = this._cropOrFull();
    for (const r of this.blurRegions) {
      const src = r.mode === 'pixelate' ? scratch.mosaic : scratch.blurred;
      if (!src) continue;
      const pts = r.pts.map((p) => this._srcToCanvas(p.x, p.y, k, crop));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    }
  }

  /* -------------------------------------------------------------- annotations */

  applyAnnotations(ctx, k) {
    if (!this.annotations.length) return;
    const crop = this._cropOrFull();
    const map = (p) => this._srcToCanvas(p.x, p.y, k, crop);

    for (const a of this.annotations) {
      if (!a.pts || !a.pts.length) continue;
      const col = a.color || '#ff3b30';
      const lw = Math.max(1.5, (a.width || 4) * k);
      ctx.save();
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (a.type === 'pen') {
        if (a.pts.length > 1) {
          ctx.beginPath();
          a.pts.forEach((p, i) => {
            const c = map(p);
            if (i === 0) ctx.moveTo(c.x, c.y);
            else ctx.lineTo(c.x, c.y);
          });
          ctx.stroke();
        }
      } else if (a.type === 'arrow') {
        const p1 = map(a.pts[0]);
        const p2 = map(a.pts[a.pts.length - 1]);
        this._drawArrow(ctx, p1, p2, lw);
      } else if (a.type === 'box') {
        const q = a.pts.map(map);
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
        ctx.closePath();
        if (a.bg) {
          ctx.fillStyle = a.bg;
          ctx.fill();
        }
        ctx.stroke();
      } else if (a.type === 'text') {
        const p = map(a.pts[0]);
        const fs = Math.max(8, (a.size || 48) * k);
        const lines = String(a.text || '').split('\n');
        const lh = fs * 1.22;
        ctx.font = `600 ${fs}px "Plex UI", -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.translate(p.x, p.y);
        ctx.rotate(this._rotRad()); // keep type aligned with the photo
        if (a.bg) {
          let wMax = 0;
          for (const ln of lines) wMax = Math.max(wMax, ctx.measureText(ln).width);
          const pad = fs * 0.3;
          ctx.fillStyle = a.bg;
          ctx.fillRect(-pad, -pad * 0.7, wMax + pad * 2, lines.length * lh + pad * 1.4);
          ctx.fillStyle = col;
        }
        lines.forEach((ln, i) => ctx.fillText(ln, 0, i * lh));
      }
      ctx.restore();
    }
  }

  _drawArrow(ctx, p1, p2, lw) {
    const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const head = Math.max(8, lw * 3.2);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - head * Math.cos(a - Math.PI / 7), p2.y - head * Math.sin(a - Math.PI / 7));
    ctx.lineTo(p2.x - head * Math.cos(a + Math.PI / 7), p2.y - head * Math.sin(a + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }

  /* --------------------------------------------------------------- mutation */

  pushBlurStroke(s) {
    const pts = s.points.map((p) => this.outputToSource(p.x, p.y));
    const dense = [];
    for (let i = 0; i < pts.length; i++) {
      dense.push(pts[i]);
      const nxt = pts[i + 1];
      if (!nxt) break;
      const dx = nxt.x - pts[i].x;
      const dy = nxt.y - pts[i].y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, s.size / 4);
      if (dist > step) {
        const n = Math.floor(dist / step);
        for (let j = 1; j < n; j++) dense.push({ x: pts[i].x + (dx * j) / n, y: pts[i].y + (dy * j) / n });
      }
    }
    this.blurStrokes.push({ points: dense, size: s.size, strength: s.strength, mode: s.mode });
  }

  // A rectangular blur/pixelate area, given in OUTPUT px. Internal: used by
  // face detection. Stored as a source-space quad so it survives crop/rotate.
  addBlurRegion(rectOut, mode = 'blur') {
    const toSrc = (ox, oy) => this.outputToSource(ox, oy);
    const x2 = rectOut.x + rectOut.w;
    const y2 = rectOut.y + rectOut.h;
    return this.addBlurRegionSourceQuad(
      [toSrc(rectOut.x, rectOut.y), toSrc(x2, rectOut.y), toSrc(x2, y2), toSrc(rectOut.x, y2)],
      mode
    );
  }

  // Same but takes source-space points directly (face boxes are already there).
  addBlurRegionSourceQuad(srcPts, mode = 'blur') {
    this.blurRegions.push({
      pts: srcPts.map((p) => ({ x: p.x, y: p.y })),
      mode: mode === 'pixelate' ? 'pixelate' : 'blur',
    });
    return this.blurRegions[this.blurRegions.length - 1];
  }

  addAnnotation(a) {
    const type = TXE_ANNOTATION_TYPES.includes(a.type) ? a.type : 'pen';
    const pts = (a.pts || []).map((p) => this.outputToSource(p.x, p.y));
    const ann = {
      type,
      pts,
      color: a.color || '#ff3b30',
      width: a.width ?? 5,
      size: a.size ?? 48,
      text: a.text ?? '',
      bg: a.bg ?? null,
    };
    this.annotations.push(ann);
    return ann;
  }

  updateAnnotation(index, patch) {
    const a = this.annotations[index];
    if (!a) return null;
    Object.assign(a, patch);
    return a;
  }

  moveAnnotation(index, dxSource, dySource) {
    const a = this.annotations[index];
    if (!a) return null;
    for (const p of a.pts) {
      p.x += dxSource;
      p.y += dySource;
    }
    return a;
  }

  static _distToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // Index of the top-most annotation near a source point, for any mark type.
  hitTestAnnotation(srcPt, tol = 0) {
    for (let i = this.annotations.length - 1; i >= 0; i--) {
      const a = this.annotations[i];
      if (!a.pts || !a.pts.length) continue;
      const grab = Math.max(tol, (a.width || 4) * 2.5 + 4);
      if (a.type === 'text') {
        if (TweetImageEditorCore._distToSegment(srcPt, a.pts[0], a.pts[0]) <= Math.max(grab, (a.size || 48) * 0.6)) {
          return i;
        }
      } else if (a.type === 'pen') {
        if (a.pts.length === 1) {
          if (TweetImageEditorCore._distToSegment(srcPt, a.pts[0], a.pts[0]) <= grab) return i;
          continue;
        }
        for (let j = 1; j < a.pts.length; j++) {
          if (TweetImageEditorCore._distToSegment(srcPt, a.pts[j - 1], a.pts[j]) <= grab) return i;
        }
      } else if (a.type === 'arrow') {
        if (TweetImageEditorCore._distToSegment(srcPt, a.pts[0], a.pts[a.pts.length - 1]) <= grab) return i;
      } else if (a.type === 'box') {
        for (let j = 0; j < a.pts.length; j++) {
          const nxt = a.pts[(j + 1) % a.pts.length];
          if (TweetImageEditorCore._distToSegment(srcPt, a.pts[j], nxt) <= grab) return i;
        }
      }
    }
    return -1;
  }

  // Source-space bounding box of an annotation, padded — used to draw the
  // selection outline around the selected mark.
  annotationBounds(index) {
    const a = this.annotations[index];
    if (!a || !a.pts || !a.pts.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of a.pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = a.type === 'text' ? (a.size || 48) * 0.55 : (a.width || 4) * 2 + 3;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  removeAnnotation(index) {
    if (index < 0 || index >= this.annotations.length) return false;
    this.annotations.splice(index, 1);
    return true;
  }

  clearAnnotations(types) {
    if (!types) this.annotations = [];
    else this.annotations = this.annotations.filter((a) => !types.includes(a.type));
  }

  applyCropRel(n) {
    const cur = this._cropOrFull();
    if (!n || n.w <= 0 || n.h <= 0) return null;
    const x = cur.x + n.x * cur.w;
    const y = cur.y + n.y * cur.h;
    const w = Math.max(1, n.w * cur.w);
    const h = Math.max(1, n.h * cur.h);
    const cx = Math.min(Math.max(x, cur.x), cur.x + cur.w - 1);
    const cy = Math.min(Math.max(y, cur.y), cur.y + cur.h - 1);
    this.crop = { x: cx, y: cy, w: Math.min(w, cur.x + cur.w - cx), h: Math.min(h, cur.y + cur.h - cy) };
    return this.crop;
  }

  // Largest centred rect with the image's own aspect that contains no
  // transparent corners at the current rotation angle.
  // Shrink the current view around its centre just enough that none of its
  // corners fall outside the photo (i.e. remove the transparent wedges left by
  // straightening). Keeping the view's own aspect means a 90° turn is a no-op
  // and a 2° straighten only trims the slivers.
  fitCorners() {
    if (!this.loaded) return this.crop;
    const cur = this._cropOrFull();
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    const eps = 0.75;

    const clean = (f) => {
      const hw = (cur.w * f) / 2;
      const hh = (cur.h * f) / 2;
      return [
        [cx - hw, cy - hh],
        [cx + hw, cy - hh],
        [cx + hw, cy + hh],
        [cx - hw, cy + hh],
      ].every(([bx, by]) => {
        const s = this.baseToSrc(bx, by);
        return s.x >= -eps && s.x <= this.imgW + eps && s.y >= -eps && s.y <= this.imgH + eps;
      });
    };

    let f = 1;
    if (!clean(1)) {
      let lo = 0.001;
      let hi = 1;
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2;
        if (clean(mid)) lo = mid;
        else hi = mid;
      }
      f = lo * 0.998;
    }
    this.crop = {
      x: cx - (cur.w * f) / 2,
      y: cy - (cur.h * f) / 2,
      w: Math.max(1, cur.w * f),
      h: Math.max(1, cur.h * f),
    };
    return this.crop;
  }

  // Largest centred rect of `ratio` inside the current view.
  autoCrop(ratio) {
    const cur = this._cropOrFull();
    let w = cur.w;
    let h = ratio ? w / ratio : cur.h;
    if (h > cur.h) {
      h = cur.h;
      w = ratio ? h * ratio : cur.w;
    }
    this.crop = { x: cur.x + (cur.w - w) / 2, y: cur.y + (cur.h - h) / 2, w, h };
    return this.crop;
  }

  clearCrop() {
    this.crop = null;
  }
  clearBlur() {
    this.blurStrokes = [];
    this.blurRegions = [];
  }
  clearBlurRegions() {
    this.blurRegions = [];
  }
  rotateBy(deg) {
    this.rotation = (((this.rotation + deg) % 360) + 360) % 360;
  }

  /* ---------------------------------------------------------------- history */

  _state() {
    return {
      rotation: this.rotation,
      flipH: this.flipH,
      flipV: this.flipV,
      filters: { ...this.filters },
      crop: this.crop ? { ...this.crop } : null,
      blurStrokes: this.blurStrokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) })),
      blurRegions: this.blurRegions.map((r) => ({ ...r, pts: r.pts.map((p) => ({ ...p })) })),
      annotations: this.annotations.map((a) => ({ ...a, pts: a.pts.map((p) => ({ ...p })) })),
    };
  }

  _restore(s) {
    this.rotation = s.rotation;
    this.flipH = s.flipH;
    this.flipV = s.flipV;
    this.filters = { ...s.filters };
    this.crop = s.crop ? { ...s.crop } : null;
    this.blurStrokes = (s.blurStrokes || []).map((st) => ({ ...st, points: st.points.map((p) => ({ ...p })) }));
    this.blurRegions = (s.blurRegions || []).map((r) => ({ ...r, pts: r.pts.map((p) => ({ ...p })) }));
    this.annotations = (s.annotations || []).map((a) => ({ ...a, pts: a.pts.map((p) => ({ ...p })) }));
  }

  getState() {
    return this._state();
  }
  setState(s) {
    this._restore(s);
  }

  // Settings that are safe to reuse as a "recipe" (geometry-independent).
  getSettings() {
    return { filters: { ...this.filters }, rotation: this.rotation, flipH: this.flipH, flipV: this.flipV };
  }
  applySettings(s) {
    if (s.filters) this.filters = { ...TXE_DEFAULT_FILTERS, ...s.filters };
    if (typeof s.rotation === 'number') this.rotation = s.rotation;
    if (typeof s.flipH === 'boolean') this.flipH = s.flipH;
    if (typeof s.flipV === 'boolean') this.flipV = s.flipV;
  }

  pushHistory() {
    this.history.push(this._state());
    if (this.history.length > this.maxHistory) this.history.shift();
    this.future = [];
  }
  canUndo() {
    return this.history.length > 0;
  }
  canRedo() {
    return this.future.length > 0;
  }
  undo() {
    if (!this.history.length) return false;
    this.future.push(this._state());
    this._restore(this.history.pop());
    return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.history.push(this._state());
    this._restore(this.future.pop());
    return true;
  }

  /* ----------------------------------------------------------------- export */

  exportCanvas(maxDim = 4096) {
    const { w, h } = this.outputSize();
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = make2d(cw, ch);
    this.compose(canvas.getContext('2d'), cw, ch);
    return canvas;
  }

  exportBlob({ maxDim = 4096, type = 'image/jpeg', quality = 0.92 } = {}) {
    return new Promise((resolve) => {
      const canvas = this.exportCanvas(maxDim);
      if (type === 'image/jpeg') {
        const flat = make2d(canvas.width, canvas.height);
        const fctx = flat.getContext('2d');
        fctx.fillStyle = '#ffffff';
        fctx.fillRect(0, 0, flat.width, flat.height);
        fctx.drawImage(canvas, 0, 0);
        flat.toBlob((b) => resolve(b), type, quality);
        return;
      }
      canvas.toBlob((b) => resolve(b), type, quality);
    });
  }

  // Pure helper shared with the UI: turn a drag expressed as relative 0..1
  // corners into a relative crop rect, honouring an optional aspect ratio and
  // clamping to the image. Tested directly.
  static cropRectRel(drag, fullW, fullH, ratio) {
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    let pw = Math.abs(drag.x1 - drag.x0) * fullW;
    let ph = Math.abs(drag.y1 - drag.y0) * fullH;
    let w;
    let h;
    if (ratio && pw > 1 && ph > 1) {
      if (pw / ph > ratio) ph = pw / ratio;
      else pw = ph * ratio;
      const fit = Math.min(1, ((1 - x) * fullW) / Math.max(1, pw), ((1 - y) * fullH) / Math.max(1, ph));
      w = (pw * fit) / fullW;
      h = (ph * fit) / fullH;
    } else {
      w = pw / fullW;
      h = ph / fullH;
      if (x + w > 1) w = 1 - x;
      if (y + h > 1) h = 1 - y;
    }
    return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
  }

  static extFor(type) {
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    return 'jpg';
  }
}

const TXE_PRESETS = {
  free: { label: 'Free', ratio: null },
  '1:1': { label: '1:1', ratio: 1 },
  '1.91:1': { label: '1.91:1', ratio: 1.91 },
  '16:9': { label: '16:9', ratio: 16 / 9 },
  '3:2': { label: '3:2', ratio: 3 / 2 },
  '4:3': { label: '4:3', ratio: 4 / 3 },
  '4:5': { label: '4:5', ratio: 4 / 5 },
  '9:16': { label: '9:16', ratio: 9 / 16 },
};

const TXE_FILTER_PRESETS = {
  normal: { ...TXE_DEFAULT_FILTERS },
  vivid: { brightness: 106, contrast: 122, saturate: 155, grayscale: 0, sepia: 0, hue: 0 },
  bw: { brightness: 102, contrast: 112, saturate: 0, grayscale: 100, sepia: 0, hue: 0 },
  warm: { brightness: 106, contrast: 106, saturate: 122, grayscale: 0, sepia: 38, hue: 0 },
  cold: { brightness: 100, contrast: 112, saturate: 95, grayscale: 0, sepia: 0, hue: -18 },
  fade: { brightness: 108, contrast: 88, saturate: 78, grayscale: 0, sepia: 6, hue: 0 },
};

const TXE_API = {
  TweetImageEditorCore,
  TXE_PRESETS,
  TXE_FILTER_PRESETS,
  TXE_DEFAULT_FILTERS,
  TXE_ANNOTATION_TYPES,
  TXE_REPO_URL,
};

if (typeof window !== 'undefined') {
  window.TweetImageEditorCore = TweetImageEditorCore;
  window.TXE_PRESETS = TXE_PRESETS;
  window.TXE_FILTER_PRESETS = TXE_FILTER_PRESETS;
  window.TXE_DEFAULT_FILTERS = TXE_DEFAULT_FILTERS;
  window.TXE_ANNOTATION_TYPES = TXE_ANNOTATION_TYPES;
  window.TXE_REPO_URL = TXE_REPO_URL;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TXE_API;
}
