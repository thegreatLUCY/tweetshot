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
  const box = await page.evaluate(() => { const r = document.querySelector('#txeCv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
  await page.click('[data-tool="crop"]');
  await page.click('#txePresetSeg [data-p="4:5"]');
  await page.mouse.move(at(0.22, 0.05)[0], at(0.22, 0.05)[1]);
  await page.mouse.down();
  await page.mouse.move(at(0.78, 0.6)[0], at(0.78, 0.6)[1], { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return 'ok';
}
