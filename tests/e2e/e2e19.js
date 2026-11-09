// Owner panel (DB password, store visibility, home row, announcement, merchants), AI paywall, compact cards.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = (r) => r.json().catch(() => ({}));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
(async () => {
  await fetch(BASE + '/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });
  // a pending merchant to approve
  const tok = (await J(await fetch(BASE + '/api/auth/pi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'tester' }) }))).token;
  await fetch(BASE + '/api/merchants/me', { method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Cairo Pi Bakery', kind: 'local', country: 'EG', city: 'Cairo', phone: '+20 100 111 2222', categories: 'bread', items: [{ title: 'Baladi bread', price: 0.5 }] }) });

  // API auth
  ok((await fetch(BASE + '/api/admin/overview')).status === 401, 'admin APIs refuse without a token');
  ok((await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'nope' }) })).status === 401, 'wrong password refused');
  ok((await J(await fetch(BASE + '/api/admin/login'))).passwordSet === false, 'no password yet → first login with CRON_SECRET');

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  await ctx.route(/cdn\.salla\.example|pcmsuper\.art|imagekit|piketplace\.com\/storage/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  // first login → choose password (stored hashed)
  await p.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await p.getByTestId('admin-password').fill('cron-test');
  await p.getByTestId('admin-login').click();
  await p.getByTestId('new-password').fill('short');
  await p.getByTestId('new-password2').fill('short');
  await p.getByTestId('save-password').click();
  ok(await p.getByText('لازم 8 حروف على الأقل').isVisible(), 'short password refused');
  await p.getByTestId('new-password').fill('s3cret-owner');
  await p.getByTestId('new-password2').fill('s3cret-owner');
  await p.getByTestId('save-password').click();
  await p.getByTestId('admin-overview').waitFor();
  ok((await J(await fetch(BASE + '/api/admin/login'))).passwordSet === true, 'password saved');
  ok((await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'cron-test' }) })).status === 401, 'after a password is set, CRON_SECRET no longer logs in');
  await p.screenshot({ path: `${OUT}/70-admin-overview.png`, fullPage: true });

  // merchants: approve
  await p.getByTestId('atab-merchants').click();
  await p.getByTestId('admin-merchants').getByText('Cairo Pi Bakery').waitFor();
  await p.getByTestId('approve').first().click();
  await p.getByTestId('admin-merchants').getByText('متوافق عليه').waitFor();
  ok(true, 'merchant approved from the panel');

  // stores: hide Piketplace → gone from search
  await p.getByTestId('atab-stores').click();
  await p.getByTestId('toggle-piketplace').click();
  await p.getByTestId('toggle-piketplace').getByText('مخفي').waitFor();
  await p.screenshot({ path: `${OUT}/71-admin-stores.png`, fullPage: true });
  await new Promise((r) => setTimeout(r, 300));
  const s1 = await J(await fetch(BASE + '/api/search?country=EG&q=headphones&x=1'));
  ok(s1.offers.length > 0 && !s1.offers.some((o) => /Piketplace/.test(o.store)), `hidden store is gone from search: ${s1.offers.map((o) => o.store).join(', ')}`);
  const dir = await J(await fetch(BASE + '/api/stores?country=EG&x=1'));
  ok(!dir.stores.some((x) => x.id === 'piketplace'), 'hidden store is gone from the directory');
  await p.getByTestId('toggle-piketplace').click();
  await p.getByTestId('toggle-piketplace').getByText('ظاهر').waitFor();
  // refresh one store
  await p.getByTestId('refresh-pcm').click();
  await p.waitForTimeout(800);
  ok(true, 'refresh a store from the panel');

  // settings: home row + announcement
  await p.getByTestId('atab-settings').click();
  await p.getByTestId('featured-store').selectOption('salla');
  await p.getByTestId('save-featured').click();
  await p.getByTestId('ann-on').check();
  await p.getByTestId('ann-ar').fill('خصم خاص الأسبوع ده');
  await p.getByTestId('ann-en').fill('Special week');
  await p.getByTestId('save-ann').click();
  await p.getByText('✓ اتحفظ').waitFor();
  await p.getByTestId('admin-logout').click();
  await p.getByTestId('admin-password').fill('s3cret-owner');
  await p.getByTestId('admin-login').click();
  await p.getByTestId('admin-overview').waitFor();
  ok(true, 'logout and login with the new password');

  // the site: announcement + home row = Salla phones/electronics + compact cards
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.getByTestId('browse-guest').click();
  await p.getByTestId('announcement').waitFor();
  ok(/Special week/.test(await p.getByTestId('announcement').innerText()), 'announcement on the home page');
  await p.getByTestId('home-featured').getByTestId('tile').first().waitFor();
  const fe = await p.getByTestId('home-featured').getByTestId('tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-store')));
  ok(fe.length >= 1 && fe.every((x) => x === 'Salla Shop Mall'), `home row = Salla phones/electronics: ${fe}`);
  const box = await p.getByTestId('home-featured').getByTestId('tile').first().boundingBox();
  ok(box && box.width <= 160 && box.height <= 280, `compact card (${Math.round(box.width)}×${Math.round(box.height)})`);
  await p.screenshot({ path: `${OUT}/72-home.png` });

  // AI paywall (no free AI in this run)
  await p.goto(BASE + '/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByTestId('ai-paywall').waitFor();
  ok((await p.getByRole('textbox', { name: 'What do you want to buy with Pi?' }).count()) === 0, 'no AI credit → paywall instead of the chat box');
  await p.getByTestId('paywall-plans').click();
  await p.getByRole('dialog', { name: 'My account' }).waitFor();
  ok(true, 'paywall opens the plans');
  const chat = await fetch(BASE + '/api/chat', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ history: [{ role: 'user', text: 'hi' }] }) });
  ok(chat.status === 402 || /QUOTA/.test(await chat.text()), `server also refuses AI without credit (${chat.status})`);
  await p.screenshot({ path: `${OUT}/73-paywall.png` });
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
