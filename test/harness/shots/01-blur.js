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
  await page.evaluate(() => { const el = document.querySelector('#txeSize'); el.value = 340; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.mouse.move(at(0.4, 0.36)[0], at(0.4, 0.36)[1]);
  await page.mouse.down();
  await page.mouse.move(at(0.56, 0.42)[0], at(0.56, 0.42)[1], { steps: 6 });
  await page.mouse.move(at(0.44, 0.52)[0], at(0.44, 0.52)[1], { steps: 6 });
  await page.mouse.move(at(0.54, 0.58)[0], at(0.54, 0.58)[1], { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  return 'ok';
}
