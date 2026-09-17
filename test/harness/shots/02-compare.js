async page => {
  await page.emulateMedia({ colorScheme: 'dark' });
  // attach the photo, then open the editor from the ✎ Edit badge
  await page.evaluate(async () => {
    const blob = await (await fetch(window.__shotImage)).blob();
    const input = document.querySelector('input[data-testid="fileInput"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'photo.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  await page.click('.txe-edit-badge');
  await page.waitForTimeout(1300);
  // a strong edit so the before/after is unmistakable
  await page.evaluate(() => {
    const set = (k, v) => { const el = document.querySelector(`input[data-f="${k}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('grayscale', 100); set('contrast', 116);
  });
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => { const r = document.querySelector('#txeCv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.click('[data-act="compare"]');
  await page.waitForTimeout(500);
  const hb = await page.evaluate(() => { const h = document.querySelector('#txeWipe').getBoundingClientRect(); return [h.left + h.width / 2, h.top + h.height / 2]; });
  await page.mouse.move(hb[0], hb[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.38, hb[1], { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  return 'ok';
}
