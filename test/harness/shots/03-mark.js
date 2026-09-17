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
  await page.click('[data-tool="mark"]');
  await page.click('#txeMarkShapes [data-shape="text"]');
  await page.evaluate(() => { const el = document.querySelector('#txeMarkSize'); el.value = 70; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.mouse.move(at(0.05, 0.09)[0], at(0.05, 0.09)[1]);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.fill('#txeMarkText', 'Lisbon, 2024');
  await page.click('#txeMarkBgSeg [data-bg="chip"]');
  await page.waitForTimeout(250);
  await page.click('#txeMarkShapes [data-shape="arrow"]');
  await page.evaluate(() => { const el = document.querySelector('#txeMarkWidth'); el.value = 9; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.mouse.move(at(0.4, 0.7)[0], at(0.4, 0.7)[1]);
  await page.mouse.down();
  await page.mouse.move(at(0.24, 0.87)[0], at(0.24, 0.87)[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  return 'ok';
}
