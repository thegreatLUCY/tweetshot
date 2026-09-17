// Editor must still work when chrome.* throws "Extension context invalidated"
async page => {
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {
        getManifest() { throw new Error('Extension context invalidated.'); },
        getURL() { throw new Error('Extension context invalidated.'); },
        onMessage: { addListener() {} },
      },
      i18n: { getMessage() { throw new Error('Extension context invalidated.'); } },
      storage: { local: {
        get() { return Promise.reject(new Error('Extension context invalidated.')); },
        set() { return Promise.reject(new Error('Extension context invalidated.')); },
      } },
    };
  });
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.waitForTimeout(400);
  return await page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const input = document.querySelector('input[data-testid="fileInput"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'x.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
    const root = document.getElementById('txe-modal-root');
    return {
      booted: !!window.__txeVer,
      opened: !!(root && root.classList.contains('open')),
      dims: (document.querySelector('#txeDims') || {}).textContent,
      errors: window.__errors,
    };
  });
}
