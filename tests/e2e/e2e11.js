// Sort chips, search cache, daily cron auth, lazy animations.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const order = (p) => p.locator('[data-offer-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-store')));
(async () => {
  ok((await fetch('http://localhost:3100/api/cron/daily')).status === 401, 'cron refuses without the secret');
  const c = await fetch('http://localhost:3100/api/cron/daily', { headers: { authorization: 'Bearer cron-test' } });
  ok(c.status === 200 && (await c.json()).ok, 'cron runs with the secret');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  const n0 = (await (await fetch('http://127.0.0.1:4020/__count')).json()).responses;
  await p.locator('textarea').fill('Wireless headphones under 500 Pi');
  await p.keyboard.press('Enter');
  await p.getByText('Best pick').first().waitFor({ timeout: 30000 });
  const n1 = (await (await fetch('http://127.0.0.1:4020/__count')).json()).responses;
  ok(n1 - n0 === 2, `first search: 2 web searches (${n1 - n0})`);
  const best = await order(p);
  await p.getByTestId('sort').getByRole('radio', { name: 'Cheapest' }).click();
  const cheap = await order(p);
  ok(cheap[0] === 'Piketplace' && cheap.at(-1) === 'Random Shop', `Cheapest: ${cheap}`);
  await p.getByTestId('sort').getByRole('radio', { name: 'Most trusted' }).click();
  ok((await order(p))[0] === 'Salla Shop Mall', `Most trusted: ${await order(p)}`);
  await p.getByTestId('sort').getByRole('radio', { name: 'Best match' }).click();
  ok((await order(p)).join() === best.join(), 'Best match restores the server ranking');
  await p.screenshot({ path: `${OUT}/17-sort.png` });
  // Same search again → served from the cache (no new web searches)
  await p.locator('textarea').fill('Wireless headphones under 500 Pi');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=sort]').length >= 2, null, { timeout: 30000 });
  const n2 = (await (await fetch('http://127.0.0.1:4020/__count')).json()).responses;
  ok(n2 === n1, `repeat search hit the cache (${n2 - n1} new web searches)`);
  // Animations still run (lazy features loaded)
  ok(await p.evaluate(() => !!document.querySelector('[data-offer-card]')?.getAttribute('style')?.includes('opacity')), 'card animation styles applied');
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
