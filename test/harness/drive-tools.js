// Every tool must actually change the image
async page => {
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const input = document.querySelector('input[data-testid="fileInput"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'p.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1000);
  const box = await page.evaluate(() => {
    const r = document.querySelector('#txeCv').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
  const drag = async (a, b) => {
    await page.mouse.move(a[0], a[1]); await page.mouse.down();
    await page.mouse.move(b[0], b[1], { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const results = {};
  const status = () => page.evaluate(() => document.querySelector('#txeStatus').textContent);

  // blur
  await page.click('[data-tool="blur"]');
  await drag(at(0.2, 0.3), at(0.6, 0.45));
  results.blur = await status();
  // mark: box
  await page.click('[data-tool="mark"]');
  await page.click('#txeMarkShapes [data-shape="box"]');
  await drag(at(0.2, 0.6), at(0.5, 0.7));
  results.mark = await status();
  // crop with preset + auto
  await page.click('[data-tool="crop"]');
  await page.click('#txePresetSeg [data-p="1:1"]');
  await page.click('[data-act="autoCrop"]');
  results.crop = await status();
  results.cropDims = await page.evaluate(() => document.querySelector('#txeDims').textContent);
  // adjust
  await page.click('[data-tool="adjust"]');
  await page.click('#txeFiltSeg [data-f="bw"]');
  results.adjust = await page.evaluate(() => document.querySelector('[data-v="grayscale"]').textContent);
  // rotate + fit
  await page.click('[data-tool="rotate"]');
  await page.click('[data-act="rotR"]');
  await page.click('[data-act="fitCorners"]');
  results.rotate = await status();
  // undo all the way back (stop as soon as nothing is left to undo)
  for (let i = 0; i < 12; i++) {
    const disabled = await page.evaluate(() => document.querySelector('[data-act="undo"]').disabled);
    if (disabled) break;
    await page.click('[data-act="undo"]');
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  results.afterUndo = await page.evaluate(() => ({
    dims: document.querySelector('#txeDims').textContent,
    gray: document.querySelector('[data-v="grayscale"]').textContent,
  }));
  results.errors = await page.evaluate(() => window.__errors);
  const ok = /Blur applied/.test(results.blur) && /Mark added/.test(results.mark)
    && /Auto crop/.test(results.crop) && results.adjust === '100' && /fitted/.test(results.rotate)
    && results.afterUndo.dims === '941×1672' && results.afterUndo.gray === '0';
  return { opened: ok, ...results };
}
