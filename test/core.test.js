const test = require('node:test');
const assert = require('node:assert/strict');
const { TweetImageEditorCore } = require('../lib/editor-core.js');

function makeCore(w = 1000, h = 500) {
  const c = new TweetImageEditorCore();
  c.img = { naturalWidth: w, naturalHeight: h };
  c.imgW = w;
  c.imgH = h;
  return c;
}

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('baseSize swaps dimensions for 90/270 degree rotation', () => {
  const c = makeCore(1000, 500);
  assert.deepEqual(c.baseSize(), { w: 1000, h: 500 });
  c.rotation = 90;
  assert.deepEqual(c.baseSize(), { w: 500, h: 1000 });
  c.rotation = 180;
  assert.deepEqual(c.baseSize(), { w: 1000, h: 500 });
  c.rotation = 270;
  assert.deepEqual(c.baseSize(), { w: 500, h: 1000 });
});

test('src <-> base round trips under rotation and flip', () => {
  const c = makeCore(800, 600);
  for (const rotation of [0, 37, 90, 180, 245, 359]) {
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        c.rotation = rotation;
        c.flipH = flipH;
        c.flipV = flipV;
        const b = c.srcToBase(123, 456);
        const s = c.baseToSrc(b.x, b.y);
        near(s.x, 123, 1e-6);
        near(s.y, 456, 1e-6);
      }
    }
  }
});

test('output <-> base round trips with a crop', () => {
  const c = makeCore(1000, 500);
  c.crop = { x: 120, y: 40, w: 300, h: 200 };
  const b = c.outputToBase(10, 20);
  assert.deepEqual(b, { x: 130, y: 60 });
  const o = c.baseToOutput(b.x, b.y);
  assert.deepEqual(o, { x: 10, y: 20 });
});

test('applyCropRel composes with an existing crop (regression: v2 bug)', () => {
  const c = makeCore(1000, 500);
  const first = c.applyCropRel({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
  assert.deepEqual(first, { x: 100, y: 100, w: 500, h: 300 });

  // crop the left half of what is currently visible
  const second = c.applyCropRel({ x: 0, y: 0, w: 0.5, h: 1 });
  assert.deepEqual(second, { x: 100, y: 100, w: 250, h: 300 });

  // cropping the visible right half instead
  c.crop = first;
  const third = c.applyCropRel({ x: 0.5, y: 0, w: 0.5, h: 1 });
  assert.deepEqual(third, { x: 350, y: 100, w: 250, h: 300 });
});

test('applyCropRel clamps to the current view', () => {
  const c = makeCore(1000, 500);
  c.applyCropRel({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 });
  assert.ok(c.crop.x + c.crop.w <= 1000 + 1e-6);
  assert.ok(c.crop.y + c.crop.h <= 500 + 1e-6);
});

test('blur strokes survive crop and rotation (stored in source space)', () => {
  const c = makeCore(1000, 500);
  // paint at the dead center of the output
  c.pushBlurStroke({ points: [{ x: 500, y: 250 }], size: 100, strength: 20, mode: 'blur' });
  assert.equal(c.blurStrokes.length, 1);
  near(c.blurStrokes[0].points[0].x, 500);
  near(c.blurStrokes[0].points[0].y, 250);

  c.applyCropRel({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  c.rotation = 90;
  // the stroke is untouched by crop/rotate
  near(c.blurStrokes[0].points[0].x, 500);
  near(c.blurStrokes[0].points[0].y, 250);
});

test('addBlurRegion maps an output rect to a source-space quad', () => {
  const c = makeCore(1000, 500);
  c.applyCropRel({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  assert.deepEqual(c.crop, { x: 100, y: 50, w: 500, h: 250 });
  c.addBlurRegion({ x: 0, y: 0, w: 100, h: 50 }, 'blur');
  assert.equal(c.blurRegions[0].mode, 'blur');
  assert.deepEqual(c.blurRegions[0].pts, [
    { x: 100, y: 50 },
    { x: 200, y: 50 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
  ]);
});

test('blur regions survive rotation as an upright quad', () => {
  const c = makeCore(1000, 500);
  c.addBlurRegion({ x: 0, y: 0, w: 100, h: 100 }, 'blur');
  c.rotation = 90;
  const b = c.blurRegions[0].pts.map((p) => c.srcToBase(p.x, p.y));
  // all four corners remain a 100x100 axis-aligned square in base space
  const xs = b.map((p) => p.x);
  const ys = b.map((p) => p.y);
  near(Math.max(...xs) - Math.min(...xs), 100, 1e-6);
  near(Math.max(...ys) - Math.min(...ys), 100, 1e-6);
});

test('undo/redo restores full edit state', () => {
  const c = makeCore(1000, 500);
  c.pushHistory();
  c.pushBlurStroke({ points: [{ x: 10, y: 10 }], size: 40, strength: 10, mode: 'blur' });
  c.filters.brightness = 150;
  assert.equal(c.history.length, 1);

  assert.ok(c.undo());
  assert.equal(c.blurStrokes.length, 0);
  assert.equal(c.filters.brightness, 100);

  assert.ok(c.redo());
  assert.equal(c.blurStrokes.length, 1);
  assert.equal(c.filters.brightness, 150);
});

test('pushHistory clears the redo stack and caps history', () => {
  const c = makeCore();
  c.maxHistory = 3;
  for (let i = 0; i < 5; i++) {
    c.pushHistory();
    c.rotation = i + 1;
  }
  assert.equal(c.history.length, 3);
  c.undo();
  assert.equal(c.future.length, 1);
  c.pushHistory();
  assert.equal(c.future.length, 0);
});

test('outputSize reflects the crop', () => {
  const c = makeCore(1000, 500);
  assert.deepEqual(c.outputSize(), { w: 1000, h: 500 });
  c.crop = { x: 10, y: 20, w: 300, h: 200 };
  assert.deepEqual(c.outputSize(), { w: 300, h: 200 });
});

test('filterString is "none" by default and composes changes', () => {
  const c = makeCore();
  assert.equal(c.filterString(), 'none');
  c.filters.brightness = 120;
  c.filters.sepia = 30;
  c.filters.hue = -20;
  assert.equal(c.filterString(), 'brightness(1.2) sepia(0.3) hue-rotate(-20deg)');
});

test('compare/original renders drop the colour filters', () => {
  const c = makeCore(1000, 500);
  c.filters.sepia = 80;
  c.filters.grayscale = 40;
  assert.equal(c.filterString(), 'grayscale(0.4) sepia(0.8)');
  // normal preview keeps the filter
  assert.equal(c._baseFilter(), 'grayscale(0.4) sepia(0.8)');
  // compare views show the untouched photo, so both panes actually differ
  assert.equal(c._baseFilter({ original: true }), 'none');
  // effects:false alone must still mean "filters on, blur/marks off"
  assert.equal(c._baseFilter({ effects: false }), 'grayscale(0.4) sepia(0.8)');
});

/* ------------------------------------------------------------- annotations */

test('annotations are stored in source space and are hit-testable', () => {
  const c = makeCore(1000, 500);
  c.addAnnotation({ type: 'text', pts: [{ x: 400, y: 200 }], text: 'hi', size: 60, color: '#fff' });
  assert.equal(c.annotations.length, 1);
  assert.equal(c.annotations[0].type, 'text');
  assert.equal(c.annotations[0].text, 'hi');
  near(c.annotations[0].pts[0].x, 400);
  near(c.annotations[0].pts[0].y, 200);

  assert.equal(c.hitTestAnnotation({ x: 405, y: 205 }, 0), 0);
  assert.equal(c.hitTestAnnotation({ x: 900, y: 400 }, 0), -1);
});

test('annotation points follow crop + rotation (unlike output-space storage)', () => {
  const c = makeCore(1000, 500);
  c.addAnnotation({ type: 'pen', pts: [{ x: 100, y: 100 }, { x: 200, y: 150 }] });
  const before = c.annotations[0].pts.map((p) => ({ ...p }));
  c.applyCropRel({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  c.rotation = 30;
  assert.deepEqual(c.annotations[0].pts, before);
});

test('moveAnnotation shifts every point', () => {
  const c = makeCore();
  c.addAnnotation({ type: 'arrow', pts: [{ x: 10, y: 10 }, { x: 50, y: 40 }] });
  c.moveAnnotation(0, 5, -3);
  assert.deepEqual(c.annotations[0].pts, [{ x: 15, y: 7 }, { x: 55, y: 37 }]);
});

test('every mark type can be hit-tested, so any of them can be moved or deleted', () => {
  const c = makeCore(1000, 500);
  c.addAnnotation({ type: 'arrow', pts: [{ x: 100, y: 100 }, { x: 300, y: 100 }], width: 6 });
  c.addAnnotation({ type: 'box', pts: [{ x: 500, y: 300 }, { x: 700, y: 300 }, { x: 700, y: 450 }, { x: 500, y: 450 }], width: 6 });
  c.addAnnotation({ type: 'pen', pts: [{ x: 100, y: 400 }, { x: 200, y: 420 }], width: 6 });
  assert.equal(c.hitTestAnnotation({ x: 200, y: 100 }, 0), 0, 'arrow midpoint');
  assert.equal(c.hitTestAnnotation({ x: 600, y: 300 }, 0), 1, 'box top edge');
  assert.equal(c.hitTestAnnotation({ x: 150, y: 410 }, 0), 2, 'pen segment');
  assert.equal(c.hitTestAnnotation({ x: 900, y: 480 }, 0), -1, 'empty space');
});

test('annotationBounds returns a padded source-space box', () => {
  const c = makeCore(1000, 500);
  c.addAnnotation({ type: 'arrow', pts: [{ x: 100, y: 100 }, { x: 300, y: 200 }], width: 6 });
  const b = c.annotationBounds(0);
  assert.ok(b.x < 100 && b.y < 100, 'padded on the low side');
  assert.ok(b.x + b.w > 300 && b.y + b.h > 200, 'padded on the high side');
  assert.equal(c.annotationBounds(9), null);
});

test('annotations survive undo/redo', () => {
  const c = makeCore();
  c.pushHistory();
  c.addAnnotation({ type: 'box', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  assert.equal(c.annotations.length, 1);
  c.undo();
  assert.equal(c.annotations.length, 0);
  c.redo();
  assert.equal(c.annotations.length, 1);
});

test('face blur regions count as edits and are cleared with the blur', () => {
  const c = makeCore(1000, 500);
  c.addBlurRegionSourceQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 'pixelate');
  assert.equal(c.blurRegions[0].mode, 'pixelate');
  assert.equal(c.hasEdits(), true);
  c.clearBlur();
  assert.equal(c.blurRegions.length, 0);
  assert.equal(c.hasEdits(), false);
});

test('hasEdits reports clean vs edited', () => {
  const c = makeCore();
  assert.equal(c.hasEdits(), false);
  c.filters.hue = 10;
  assert.equal(c.hasEdits(), true);
  c.resetEdits();
  assert.equal(c.hasEdits(), false);
});

/* --------------------------------------------------- straighten and fitting */

test('fitCorners is a no-op at 0/90/180/270 degrees', () => {
  for (const rotation of [0, 90, 180, 270]) {
    const c = makeCore(1600, 1000);
    c.rotation = rotation;
    const crop = c.fitCorners();
    const base = c.baseSize();
    near(crop.w, base.w, 1);
    near(crop.h, base.h, 1);
    near(crop.x, 0, 1);
    near(crop.y, 0, 1);
  }
});

test('fitCorners removes transparent corners at any angle', () => {
  for (const rotation of [3, 11, 23, 44, -12]) {
    const c = makeCore(1600, 1000);
    c.rotation = rotation;
    const crop = c.fitCorners();
    const base = c.baseSize();
    // inside the base bounds
    assert.ok(crop.x >= -1 && crop.y >= -1);
    assert.ok(crop.x + crop.w <= base.w + 1);
    assert.ok(crop.y + crop.h <= base.h + 1);
    // all four corners land back inside the source image
    const corners = [
      [crop.x, crop.y],
      [crop.x + crop.w, crop.y],
      [crop.x + crop.w, crop.y + crop.h],
      [crop.x, crop.y + crop.h],
    ];
    for (const [bx, by] of corners) {
      const s = c.baseToSrc(bx, by);
      assert.ok(s.x > -1.5 && s.x < c.imgW + 1.5, `x ${s.x} for ${rotation}deg`);
      assert.ok(s.y > -1.5 && s.y < c.imgH + 1.5, `y ${s.y} for ${rotation}deg`);
    }
  }
});

/* -------------------------------------------------------------- crop rect */

test('cropRectRel passes a free drag straight through', () => {
  const r = TweetImageEditorCore.cropRectRel({ x0: 0.25, y0: 0.1, x1: 0.75, y1: 0.6 }, 1000, 500, null);
  near(r.x, 0.25);
  near(r.y, 0.1);
  near(r.w, 0.5);
  near(r.h, 0.5);
});

test('cropRectRel normalises a drag made in any direction', () => {
  const r = TweetImageEditorCore.cropRectRel({ x0: 0.8, y0: 0.7, x1: 0.2, y1: 0.3 }, 1000, 500, null);
  near(r.x, 0.2);
  near(r.y, 0.3);
  near(r.w, 0.6);
  near(r.h, 0.4);
});

test('cropRectRel applies the aspect ratio and never overflows the image', () => {
  // a 1:1 request dragged near the right/bottom edge must shrink, not spill
  const r = TweetImageEditorCore.cropRectRel({ x0: 0.6, y0: 0.6, x1: 0.99, y1: 0.99 }, 1600, 1000, 1);
  assert.ok(r.x + r.w <= 1 + 1e-9, 'x+w overflowed');
  assert.ok(r.y + r.h <= 1 + 1e-9, 'y+h overflowed');
  const pw = r.w * 1600;
  const ph = r.h * 1000;
  near(pw / ph, 1, 0.02);
});

test('cropRectRel returns an empty rect for a degenerate drag', () => {
  const r = TweetImageEditorCore.cropRectRel({ x0: 0.4, y0: 0.4, x1: 0.4, y1: 0.4 }, 800, 600, null);
  assert.equal(r.w, 0);
  assert.equal(r.h, 0);
});

test('autoCrop centres the largest rect of a given ratio', () => {
  const c = makeCore(1600, 1000);
  const crop = c.autoCrop(1);
  near(crop.w, 1000, 1);
  near(crop.h, 1000, 1);
  near(crop.x, 300, 1);
  near(crop.y, 0, 1);

  c.crop = null; // autoCrop is relative to the current view
  const wide = c.autoCrop(2);
  near(wide.w, 1600, 1);
  near(wide.h, 800, 1);
});
