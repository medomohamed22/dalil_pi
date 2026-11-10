// Five features: AI-credit plans, store traffic + admin, AI enrichment + twins, product page, missed searches.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = (r) => r.json().catch(() => ({}));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
let adminTok = null;
const admin = async () => {
  adminTok ??= (await J(await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'cron-test' }) }))).token;
  return J(await fetch(BASE + '/api/admin/stats?days=30', { headers: { Authorization: `Bearer ${adminTok}` } }));
};
(async () => {
  // 3) smart indexing by rules only — no AI call at all
  const c0 = await J(await fetch('http://127.0.0.1:4020/__count'));
  const r1 = await J(await fetch(BASE + '/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } }));
  const c1 = await J(await fetch('http://127.0.0.1:4020/__count'));
  ok(r1.ok && !('enrich' in r1) && c1.enrich === c0.enrich, `catalog indexed with rules only, no AI calls (${c0.enrich} → ${c1.enrich})`);
  const cat = await J(await fetch(BASE + '/api/search?country=EG&cat=headphones'));
  ok(cat.offers.some((o) => /SpaceBuds 2/.test(o.title)) && cat.offers.length >= 3 && !cat.offers.some((o) => /honey|shoes|حذاء/i.test(o.title)), `rule categories: ${cat.offers.map((o) => o.title).join(' | ')}`);
  const ar = await J(await fetch(BASE + '/api/search?country=EG&q=' + encodeURIComponent('أوريمو')));
  ok(ar.offers.some((o) => /oraimo/i.test(o.title)), 'Arabic brand "أوريمو" finds oraimo (dictionary)');
  const sb = await J(await fetch(BASE + '/api/search?country=EG&q=' + encodeURIComponent('oraimo spacebuds')));
  const salla = sb.offers.find((o) => o.store === 'Salla Shop Mall' && /SpaceBuds 2/.test(o.title));
  ok(salla && salla.twins && salla.twins[0].store.startsWith('Piketplace') && salla.twins[0].total === 700, `same product in another store by brand + model rule (690 + 10 shipping): ${JSON.stringify(salla && salla.twins)}`);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/cdn\.salla\.example|pcmsuper\.art|imagekit|piketplace\.com\/storage/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route(/mall\.salla-shop\.com|mpiket\.pinet\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>store</h1>' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  // 1) plans wording + free orders
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByTestId('home').waitFor();

  // 4) product page from a tile
  await p.getByTestId('shop-search').fill('oraimo spacebuds');
  await p.keyboard.press('Enter');
  await p.locator('[data-testid=results] [data-testid=tile][data-store="Salla Shop Mall"]').first().click();
  await p.getByTestId('product-view').waitFor();
  await p.getByTestId('offer-detail').waitFor();
  ok(p.url().includes('v=p') && p.url().includes('salla%3A'), `tile opens the product page: ${p.url()}`);
  ok(await p.getByTestId('gallery').isVisible(), 'photo gallery');
  const tw = await p.getByTestId('twins').innerText();
  ok(/Piketplace/.test(tw) && /700/.test(tw) && /cheaper/.test(tw), `same product elsewhere, cheaper badge: ${tw.replace(/\n/g, ' ')}`);
  ok(/856/.test(await p.getByTestId('offer-detail').innerText()), 'was price shown');
  await p.getByTestId('share').click();
  await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(/\/p\/salla%3A/.test(clip), `share copies the public product page link: ${clip}`);
  await p.screenshot({ path: `${OUT}/60-product.png` });
  // Order from the product page → free (no credit), tracked
  const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), p.getByTestId('offer-detail').getByRole('button', { name: /^Order/ }).click()]);
  ok(/mall\.salla-shop\.com\/product\//.test(tab.url()), 'Order opens the store product');
  await tab.close();
  await p.waitForTimeout(1200);
  // twin row → its own page
  await p.getByTestId('twins').getByRole('button').first().click();
  await p.waitForFunction(() => location.search.includes('pkt%3A'), null, { timeout: 8000 });
  await p.getByTestId('offer-detail').waitFor();
  ok(/Buds EG/.test(await p.getByTestId('product-view').innerText()), 'twin opens the Piketplace product page');
  await p.goBack();
  await p.waitForFunction(() => location.search.includes('salla%3A'), null, { timeout: 8000 });
  ok(true, 'Back returns to the first product');

  // 2) store visit tracked + admin
  await p.goto(BASE + '/?v=store&id=salla', { waitUntil: 'networkidle' });
  const [t2] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), p.getByTestId('visit-store').click()]);
  await t2.close();
  // 5) missed search
  await p.goto(BASE + '/?v=search&q=' + encodeURIComponent('playstation 5 slim'), { waitUntil: 'networkidle' });
  await p.getByTestId('no-results').waitFor();
  await p.waitForTimeout(1500);
  const st = await admin();
  const sallaRow = (st.stores || []).find((x) => x.store === 'Salla Shop Mall');
  ok(sallaRow && sallaRow.orders >= 1 && sallaRow.visits >= 1, `admin: Salla got the order + the visit: ${JSON.stringify(sallaRow)}`);
  ok((st.misses || []).length === 1 && st.misses[0].q === 'playstation 5 slim' && st.misses[0].country === 'EG', `admin: missed search recorded once, right country: ${JSON.stringify(st.misses)}`);
  ok((await fetch(BASE + '/api/admin/stats')).status === 401, 'admin stats need the key');
  await p.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await p.getByTestId('admin-password').fill('cron-test');
  await p.getByTestId('admin-login').click();
  await p.getByTestId('new-password').fill('owner-pass-123');
  await p.getByTestId('new-password2').fill('owner-pass-123');
  await p.getByTestId('save-password').click();
  await p.getByTestId('admin-overview').waitFor();
  await p.waitForFunction(() => /زيارات للمتاجر\s*1/.test(document.querySelector('[data-testid=admin-totals]')?.innerText || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/زيارات للمتاجر\s*1/.test(await p.getByTestId('admin-totals').innerText()), 'admin overview after choosing a password (1 visit)');
  await p.getByTestId('atab-searches').click();
  await p.getByTestId('admin-misses').getByText('playstation 5 slim').waitFor();
  ok(true, 'admin: missed searches tab');
  await p.getByTestId('atab-overview').click();
  await p.getByTestId('admin-chart').waitFor();
  await p.waitForFunction(() => document.querySelector('[data-testid=admin-chart]')?.children.length > 0, null, { timeout: 10000 }).catch(() => {});
  const barH = await p.getByTestId('admin-chart').evaluate((el) => Math.max(...[...el.children].map((c) => [...c.children].reduce((h, x) => h + x.getBoundingClientRect().height, 0))));
  ok(barH > 50, `daily chart draws today's bar (${Math.round(barH)} px)`);
  await p.screenshot({ path: `${OUT}/61-admin.png`, fullPage: true });

  // 1) plan wording
  await p.goto(BASE + '/?v=ask', { waitUntil: 'networkidle' });
  ok(/AI requests left/.test(await p.getByTestId('usage').innerText()), `usage chip counts AI requests: ${await p.getByTestId('usage').innerText()}`);
  const tok = (await J(await fetch(BASE + '/api/auth/pi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'tester' }) }))).token;
  const me = await J(await fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + tok } }));
  ok(me.usage && me.usage.ordersUsed === 0, `the order used no credit (ordersUsed=${me.usage && me.usage.ordersUsed})`);
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
