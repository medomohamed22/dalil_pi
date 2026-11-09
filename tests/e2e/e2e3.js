// Orders: Order button on Pi-priced offers, opens the store product page, addresses.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  // Store pages are not reachable from the test box — answer them locally.
  await ctx.route(/piketplace\.com|salla-shop\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>store page</h1>' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  await p.locator('textarea').fill('Wireless headphones under 500 Pi');
  await p.keyboard.press('Enter');
  await p.getByText('Best pick').waitFor({ timeout: 30000 });

  const orderBtns = p.locator('[data-offer-card] button', { hasText: 'Order' });
  ok((await orderBtns.count()) === 2, `Order button on the 2 Pi-priced offers (${await orderBtns.count()})`);
  ok((await p.locator('[data-offer-card][data-store="Random Shop"] a', { hasText: 'Open store' }).count()) === 1, 'non-Pi offer keeps a plain "Open store" link');

  const [popup] = await Promise.all([ctx.waitForEvent('page'), orderBtns.first().click()]);
  await popup.waitForLoadState();
  ok(popup.url() === 'https://piketplace.com/item/jbl-520', `Order opens the product page in the store (${popup.url()})`);
  await popup.close();

  // account button is in the header now
  await p.locator('header').getByRole('button', { name: 'My account' }).click();
  const acc = p.getByRole('dialog', { name: 'My account' });
  ok(!/Orders\s*1 \/ 3/.test(await acc.innerText()) && /AI requests/.test(await acc.innerText()), 'orders are free now: no order counter, only AI requests');
  await acc.getByRole('tab', { name: 'Orders' }).click();
  await acc.getByTestId('order-row').first().waitFor();
  ok((await acc.getByTestId('order-row').count()) === 1, 'order saved in history');
  await acc.getByRole('button', { name: 'Close' }).click();

  // Orders are free: even past the old monthly limit (3 here) the Order buttons keep working
  for (let i = 0; i < 3; i++) {
    const [pp] = await Promise.all([ctx.waitForEvent('page'), orderBtns.nth(1).click()]);
    await pp.close();
    await p.waitForTimeout(800);
  }
  ok(!(await orderBtns.first().isDisabled()) && (await p.getByText('No orders left').count()) === 0, 'Order still enabled after 4 orders (orders are free)');
  await p.screenshot({ path: `${OUT}/7-orders.png` });
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})();
