export default async function run(page, ui) {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name=email]', { timeout: 15000 });
  await page.fill('input[name=email]', 'super@celebrai.app');
  await page.fill('input[name=password]', 'SuperAdmin@123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 });
  await page.waitForTimeout(2500);

  const eventId = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) =>
      /\/eventos\/[^/]+/.test(a.getAttribute('href') || ''),
    );
    return (link?.getAttribute('href') || '').match(/\/eventos\/([^/]+)/)?.[1] ?? null;
  });

  await page.goto(`http://localhost:5173/eventos/${eventId}/convites`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3500);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(1200);

  return await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // Encontra elementos que estouram a viewport.
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 2 && r.width > 0) {
        offenders.push({
          tag: el.tagName,
          cls: String(el.className).slice(0, 90),
          w: Math.round(r.width),
          right: Math.round(r.right),
        });
      }
    }
    const wrapper = document.querySelector('.table-wrapper');
    return {
      vw,
      docScrollW: document.documentElement.scrollWidth,
      offenders: offenders.slice(0, 12),
      wrapper: wrapper
        ? {
          clientW: wrapper.clientWidth,
          scrollW: wrapper.scrollWidth,
          overflowX: getComputedStyle(wrapper).overflowX,
          rectW: Math.round(wrapper.getBoundingClientRect().width),
        }
        : null,
    };
  });
}
