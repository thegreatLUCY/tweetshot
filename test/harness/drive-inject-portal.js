// Regression: X can hoist its media input outside the composer subtree, so the
// lookup must not depend on composerScope or "Use in tweet" degrades to a download
async page => {
  await page.goto('http://127.0.0.1:8791/test/harness/composer-portal.html');
  await page.waitForTimeout(400);
  await page.click('.txe-toolbar-btn');
  await page.waitForTimeout(200);
  await page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'portal.png', { type: 'image/png' }));
    const input = window.__lastPicker;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => window.__previewCount());
  await page.click('[data-act="save"]');
  await page.waitForTimeout(1800);
  const after = await page.evaluate(() => ({
    previews: window.__previewCount(),
    toast: (document.querySelector('.txe-toast') || {}).textContent || null,
  }));
  return { opened: before === 0 && after.previews === 1 && /Added to tweet/.test(after.toast || ''), before, after };
}
