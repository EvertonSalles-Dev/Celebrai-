export default async function run(page, ui) {
  const out = { visited: [], apiErrors: [] };

  const failed = [];
  page.on('response', (res) => {
    if (res.status() >= 500) failed.push({ url: res.url(), status: res.status() });
  });

  let snap = await ui.snapshot();
  await ui.fill('@' + snap.match(/@(e\d+) textbox "E-mail"/)[1], 'super@celebrai.app');
  await ui.fill('@' + snap.match(/@(e\d+) textbox "Senha"/)[1], 'SuperAdmin@123');
  snap = await ui.snapshot();
  await ui.click('@' + snap.match(/@(e\d+) button "Entrar no painel"/)[1]);
  await page.waitForTimeout(3500);

  const base = 'https://celebrai-ofc-api-22.vercel.app';
  const eventId = 'cmu22xv2n000413ziecg6ivg7';

  const routes = [
    '/dashboard',
    '/eventos',
    '/eventos/' + eventId,
    '/eventos/' + eventId + '/convidados',
    '/eventos/' + eventId + '/convites',
    '/eventos/' + eventId + '/local',
    '/eventos/' + eventId + '/configuracoes',
    '/eventos/' + eventId + '/auditoria',
    '/usuarios',
    '/check-in',
    '/check-in/scanner',
  ];

  for (const r of routes) {
    try {
      await page.goto(base + r, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const body = await page.evaluate(() => document.body.innerText);
      out.visited.push({
        route: r,
        url: page.url(),
        internalError: /Erro interno do servidor/i.test(body),
        head: body.slice(0, 220),
      });
    } catch (e) {
      out.visited.push({ route: r, error: e.message });
    }
  }

  out.apiErrors = failed;
  return out;
}
