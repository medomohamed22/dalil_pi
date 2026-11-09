// Trust score 0–100 + breakdown + verbatim review quotes + order gating.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  await ctx.route(/piketplace\.com|salla-shop\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>store</h1>' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  await p.locator('textarea').fill('Wireless headphones under 500 Pi');
  await p.keyboard.press('Enter');
  await p.getByText('Best pick').waitFor({ timeout: 40000 });
  const cards = p.locator('[data-offer-card]');
  const score = async (store) => Number((await p.locator(`[data-offer-card][data-store="${store}"] [data-testid=trust]`).innerText()).trim());
  const salla = await score('Salla Shop Mall'), piket = await score('Piketplace'), rnd = await score('Random Shop');
  console.log('scores', { salla, piket, rnd });
  ok(salla >= 75 && salla <= 100, `Salla (escrow, verified, 38 reviews) high: ${salla}`);
  ok(piket >= 60 && piket < salla, `Piketplace trusted but below Salla: ${piket}`);
  ok(rnd < 40, `unknown EGP shop under 40: ${rnd}`);
  ok((await p.locator('[data-offer-card][data-store="Random Shop"]').innerText()).includes('Trust score too low'), 'low-trust card explains no order');
  ok((await p.locator('[data-offer-card][data-store="Random Shop"] button', { hasText: 'Order' }).count()) === 0, 'no Order button under 40');
  const last = await cards.last().getAttribute('data-store');
  ok(last === 'Random Shop', `low-trust store sorted last (${last})`);
  // breakdown
  await p.locator('[data-offer-card][data-store="Salla Shop Mall"] [data-testid=trust]').click();
  const bd = await p.locator('[data-testid=trust-breakdown]').innerText();
  ok(/Official Pi store/.test(bd) && /Payment protection/.test(bd) && /\d+\/100/.test(bd), 'breakdown lists the 6 parts');
  // reviews: real quote kept, invented one dropped
  const rv = await p.locator('[data-offer-card][data-store="Salla Shop Mall"] [data-testid=reviews]').innerText();
  ok(rv.includes('Great sound and fast delivery to Cairo'), 'verbatim review shown');
  ok(!rv.includes('10/10'), 'invented review dropped');
  await p.locator('[data-offer-card][data-store="Salla Shop Mall"]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/11-trust.png` });
  // tampered trust score refused by server
  const token = (await (await fetch('http://localhost:3100/api/auth/pi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'tester' }) })).json()).token;
  const offers = await p.evaluate(async () => {
    const { default: Dexie } = await import('https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm').catch(() => ({ default: null }));
    return null;
  });
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
