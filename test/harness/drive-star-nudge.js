// The "star us" ask must appear exactly once, ever — never on every save.
async page => {
  // storage-backed chrome mock so the flag survives a page reload
  await page.addInitScript(() => {
    const load = () => { try { return JSON.parse(localStorage.getItem('__txeMock') || '{}'); } catch { return {}; } };
    const save = (o) => localStorage.setItem('__txeMock', JSON.stringify(o));
    window.chrome = {
      runtime: { onMessage: { addListener() {} } },
      i18n: { getMessage: () => '' },
      storage: {
        local: {
          get(k) { const s = load(); const r = {}; if (s[k] !== undefined) r[k] = s[k]; return Promise.resolve(r); },
          set(o) { const s = load(); Object.assign(s, o); save(s); return Promise.resolve(); },
        },
      },
    };
  });

  const attach = () => page.evaluate(async () => {
    const blob = await (await fetch('/test/harness/portrait.png')).blob();
    const input = document.querySelector('input[data-testid="fileInput"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const runSave = async () => {
    await attach();
    await page.waitForTimeout(1300);
    await page.click('[data-act="save"]');
    await page.waitForTimeout(3400);
    return page.evaluate(() => {
      const t = document.querySelector('.txe-toast');
      const link = t ? t.querySelector('a[href*="github.com"]') : null;
      return { text: t ? t.textContent.trim() : '', hasStarLink: !!link, href: link ? link.href : null };
    });
  };

  // ---- first save ever: the ask should appear ----
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  await page.evaluate(() => localStorage.removeItem('__txeMock'));
  const first = await runSave();

  // ---- second save after a reload: it must NOT appear again ----
  await page.goto('http://127.0.0.1:8791/test/harness/composer.html');
  const second = await runSave();

  const flag = await page.evaluate(() => JSON.parse(localStorage.getItem('__txeMock') || '{}').txeStarNudge);

  return {
    opened: first.hasStarLink && /Star TweetShot/.test(first.text) && !second.hasStarLink && flag === 1,
    first,
    second,
    flag,
  };
}
