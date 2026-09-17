// Attaching via the composer's own file input is intercepted
async page => {
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.waitForTimeout(400);
  return await page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const input = document.querySelector('input[data-testid="fileInput"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'native.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
    const root = document.getElementById('txe-modal-root');
    return { opened: !!(root && root.classList.contains('open')), dims: (document.querySelector('#txeDims') || {}).textContent, errors: window.__errors };
  });
}
