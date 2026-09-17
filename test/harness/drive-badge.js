// The Edit badge appears on an attached preview and opens the editor
async page => {
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.waitForTimeout(400);
  return await page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const img = new Image();
    img.style.width = '180px';
    img.src = URL.createObjectURL(blob);
    document.getElementById('media').appendChild(img);
    await img.decode();
    await new Promise((r) => setTimeout(r, 500));
    const badge = document.querySelector('.txe-edit-badge');
    if (!badge) return { opened: false, reason: 'badge never appeared' };
    badge.click();
    await new Promise((r) => setTimeout(r, 1500));
    const root = document.getElementById('txe-modal-root');
    return { opened: !!(root && root.classList.contains('open')), dims: (document.querySelector('#txeDims') || {}).textContent, errors: window.__errors };
  });
}
