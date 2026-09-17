// "Edit photo" in the toolbar with no attachment -> file picker -> editor
async page => {
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.waitForTimeout(400);
  return await page.evaluate(async () => {
    const btn = document.querySelector('.txe-toolbar-btn');
    if (!btn) return { opened: false, reason: 'no toolbar button' };
    btn.click();
    const input = window.__lastPicker;
    if (!input) return { opened: false, reason: 'picker never opened' };
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'picked.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
    const root = document.getElementById('txe-modal-root');
    return { opened: !!(root && root.classList.contains('open')), dims: (document.querySelector('#txeDims') || {}).textContent, errors: window.__errors };
  });
}
