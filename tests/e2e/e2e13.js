// Search batch: preferences → prompt, AR/EN lexicon, watchlist + price-drop alert, more from store.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  await fetch('http://localhost:3100/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  // Preferences
  await p.locator('header').getByRole('button', { name: 'My account' }).click();
  await p.getByRole('tab', { name: 'Preferences' }).click();
  const pf = p.getByTestId('prefs');
  await pf.locator('input').nth(0).fill('500');
  await pf.locator('input').nth(1).fill('Anker');
  await pf.locator('input[type=checkbox]').check();
  await pf.getByRole('button', { name: 'Save' }).click();
  await pf.getByRole('button', { name: 'Saved' }).waitFor();
  await p.screenshot({ path: `${OUT}/21-prefs.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
  // Lexicon (single Arabic query → + English) via the Salla partner API mock
  await p.locator('textarea').fill('SALLA1');
  await p.keyboard.press('Enter');
  await p.getByText('Salla one done').waitFor({ timeout: 30000 });
  ok(await p.getByText('english-match=yes').count() > 0, 'Arabic query also finds the English-only Salla product (lexicon)');
  const prompts = await (await fetch('http://127.0.0.1:4020/__prompts')).json();
  const last = prompts.at(-1);
  ok(last.includes('budget up to 500 PI') && last.includes('preferred brands: Anker') && last.includes('only stores that sell in or ship to'), 'preferences reach the agent');
  // Watch a product, then the daily cron finds a lower price
  await p.locator('textarea').fill('WOO mug');
  await p.keyboard.press('Enter');
  await p.getByText('Mugs you can buy with Pi').waitFor({ timeout: 30000 });
  await p.locator('[data-offer-card][data-store="Pi Mug Shop"] [data-testid=open-detail]').click();
  await p.getByTestId('watch-btn').click();
  await p.getByText("Watching — we'll tell you").waitFor({ timeout: 10000 });
  ok(true, 'watch saved');
  await p.screenshot({ path: `${OUT}/22-watch.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  // More from this store
  await p.locator('[data-offer-card][data-store="Pi Mug Shop"] [data-testid=open-detail]').first().click();
  await p.getByTestId('more-from-store').click();
  await p.getByText('Show me more products from Pi Mug Shop').waitFor({ timeout: 10000 });
  ok(true, 'more from this store asks the agent');
  await p.getByText('Best pick').first().waitFor({ timeout: 30000 });
  await fetch('http://127.0.0.1:4040/__price', { method: 'POST', body: JSON.stringify({ price: 4000 }) });
  const cron = await (await fetch('http://localhost:3100/api/cron/daily', { headers: { authorization: 'Bearer cron-test' } })).json();
  ok(cron.watches && cron.watches.checked >= 1 && cron.watches.drops === 1, `cron found the drop: ${JSON.stringify(cron.watches)}`);
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByTestId('drops').waitFor({ timeout: 10000 });
  ok(/1 watched product got cheaper/.test(await p.getByTestId('drops').innerText()), 'price-drop chip');
  await p.getByTestId('drops').click();
  const wl = p.getByTestId('watchlist');
  await wl.getByTestId('watch-row').first().waitFor();
  const wt = await wl.innerText();
  ok(wt.includes('Pi Mug') && wt.includes('Price dropped') && wt.includes('40'), 'watchlist shows the new price');
  await p.screenshot({ path: `${OUT}/23-watchlist.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
  await p.waitForTimeout(500);
  ok((await p.getByTestId('drops').count()) === 0, 'chip clears after viewing');
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
