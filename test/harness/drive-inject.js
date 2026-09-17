// "Use in tweet" must attach the edited image, never download
async page => {
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const input = document.querySelector('input[data-testid="fileInput"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'attach.png', { type: 'image/png' }));
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
    modalOpen: !!document.querySelector('#txe-modal-root.open'),
  }));
  return { opened: before === 0 && after.previews === 1 && /Added to tweet/.test(after.toast || ''), before, after };
}
