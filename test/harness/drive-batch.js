// Selecting several images queues them; saving steps to the next one
async page => {
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.waitForTimeout(400);
  const first = await page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const input = document.querySelector('input[data-testid="fileInput"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'one.png', { type: 'image/png' }));
    dt.items.add(new File([blob], 'two.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
    const label = document.querySelector('.txe-btn-label');
    return { opened: !!document.querySelector('#txe-modal-root.open'), label: label ? label.textContent : null };
  });
  // save the first -> should advance to the second, not close
  await page.click('[data-act="save"]');
  await page.waitForTimeout(1400);
  const after = await page.evaluate(async () => {
    const label = document.querySelector('.txe-btn-label');
    const root = document.getElementById('txe-modal-root');
    return { stillOpen: !!(root && root.classList.contains('open')), label: label ? label.textContent : null, dims: (document.querySelector('#txeDims') || {}).textContent };
  });
  return { opened: first.opened && after.stillOpen && /Use in tweet/.test(after.label || ''), firstLabel: first.label, after: after };
}
