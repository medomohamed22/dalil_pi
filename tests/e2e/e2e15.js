// The 9 new features: store check, price history, reviews/disputes, target price, cart, ask the shop, deals/for-you, Telegram digest.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = (r) => r.json().catch(() => ({}));
(async () => {
  const token = (await J(await fetch(BASE + '/api/auth/pi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'tester' }) }))).token;
  const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  // older prices for the Salla Q30 (usual ~560) and a drop for a deal
  await fetch(BASE + '/api/dev/seed-prices', { method: 'POST', body: JSON.stringify([
    { url_key: 'mall.salla-shop.com/products/q30', day: day(20), price: 560, currency: 'PI', title: 'Soundcore Q30', store: 'Salla Shop Mall', url: 'https://mall.salla-shop.com/products/q30', country: 'EG' },
    { url_key: 'mall.salla-shop.com/products/q30', day: day(10), price: 550, currency: 'PI', title: 'Soundcore Q30', store: 'Salla Shop Mall', url: 'https://mall.salla-shop.com/products/q30', country: 'EG' },
  ]) });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' }, geolocation: { latitude: 30.05, longitude: 31.24 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  await ctx.route(/piketplace\.com|salla-shop\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>store</h1>' }));
  await p.goto(BASE + '/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});

  // 1) Store check
  await p.getByTestId('check-open').click();
  const chk = p.getByTestId('check');
  await chk.locator('input').fill('http://127.0.0.1:4040/phish');
  await chk.getByRole('button', { name: 'Check' }).click();
  await chk.getByTestId('check-result').waitFor({ timeout: 20000 });
  ok(/SCAM/.test(await chk.getByTestId('check-result').innerText()) && /passphrase/.test(await chk.getByTestId('check-result').innerText()), 'phishing page flagged as SCAM');
  await chk.locator('input').fill('http://127.0.0.1:4040/product/pi-mug/');
  await chk.getByRole('button', { name: 'Check' }).click();
  await p.waitForFunction(() => /Pi payment at checkout/.test(document.querySelector('[data-testid=check-result]')?.textContent || ''), null, { timeout: 20000 });
  ok(true, 'Pi checkout detected for a WooCommerce + Sallanet store');
  await p.screenshot({ path: `${OUT}/26-check.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // 2) Price history + 3) cart
  await p.locator('textarea').first().fill('Wireless headphones under 500 Pi');
  await p.keyboard.press('Enter');
  await p.getByText('Best pick').first().waitFor({ timeout: 30000 });
  const salla = p.locator('[data-offer-card][data-store="Salla Shop Mall"]');
  ok(/below its usual price/.test(await salla.innerText()), `price badge: ${(await salla.getByTestId('price-badge').innerText().catch(() => ''))}`);
  await salla.getByTestId('open-detail').click();
  await p.getByTestId('price-history').waitFor();
  const ph = await p.getByTestId('price-history').innerText();
  ok(/Price over \d+ days seen/.test(ph) && /lowest/.test(ph), `price history in the product sheet: ${ph.replace(/\s+/g, ' ')}`);
  await p.getByTestId('add-to-cart').click();
  await p.screenshot({ path: `${OUT}/27-history.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await p.locator('[data-offer-card][data-store="Piketplace"] [data-testid=open-detail]').click();
  await p.getByTestId('add-to-cart').click();
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  ok((await p.getByTestId('cart-btn').innerText()).includes('2'), 'cart badge shows 2');
  await p.getByTestId('cart-btn').click();
  const cart = p.getByTestId('cart');
  ok((await cart.getByTestId('cart-item').count()) === 2 && /935/.test(await cart.getByTestId('cart-total').innerText()) && /2 stores/.test(await cart.getByTestId('cart-total').innerText()), `cart total across stores: ${(await cart.getByTestId('cart-total').innerText()).replace(/\s+/g, ' ')}`);
  await p.screenshot({ path: `${OUT}/28-cart.png` });
  const [pop] = await Promise.all([ctx.waitForEvent('page'), cart.getByTestId('cart-item').filter({ hasText: 'JBL' }).getByTestId('cart-order').click()]);
  await pop.close();
  await p.waitForTimeout(800);
  ok((await p.getByTestId('cart-btn').innerText()).includes('1'), 'ordered item leaves the cart');

  // 4) Reviews + disputes on those orders
  const [pop2] = await Promise.all([ctx.waitForEvent('page'), p.locator('[data-offer-card][data-store="Salla Shop Mall"] button', { hasText: 'Order' }).click()]);
  await pop2.close();
  await p.waitForTimeout(800);
  await p.locator('header').getByRole('button', { name: 'My account' }).click();
  await p.getByRole('tab', { name: 'Orders' }).click();
  const rows = p.getByTestId('order-row');
  await rows.first().waitFor();
  const salRow = rows.filter({ hasText: 'Salla Shop Mall' }).first();
  await salRow.getByRole('button', { name: 'I paid' }).click();
  await p.waitForTimeout(600);
  await salRow.getByTestId('rate-store').click();
  await salRow.getByRole('radio', { name: '4' }).click();
  await salRow.getByTestId('feedback-send').click();
  await p.getByText('your review counts').waitFor();
  ok(true, 'review saved');
  const pikRow = p.getByTestId('order-row').filter({ hasText: 'Piketplace' }).first();
  await pikRow.getByRole('button', { name: 'I paid' }).click();
  await p.waitForTimeout(600);
  await pikRow.getByTestId('report-problem').click();
  await pikRow.getByTestId('problem-kind').selectOption('not_delivered');
  await pikRow.getByTestId('feedback-send').click();
  await p.getByText('lowers the store').waitFor();
  ok(true, 'problem reported');
  await p.screenshot({ path: `${OUT}/29-feedback.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
  await p.waitForTimeout(500);
  const trustBefore = Number(await p.locator('[data-offer-card][data-store="Piketplace"] [data-testid=trust]').first().innerText());
  await p.getByRole('textbox', { name: 'What do you want to buy with Pi?' }).fill('Wireless headphones under 500 Pi again');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=follow-ups]').length >= 1 && document.querySelectorAll('[data-offer-card]').length >= 6, null, { timeout: 30000 });
  await p.waitForTimeout(900);
  const trustAfter = Number(await p.locator('[data-offer-card][data-store="Piketplace"] [data-testid=trust]').last().innerText());
  ok(trustAfter <= trustBefore - 8, `reported problem lowers trust (${trustBefore} → ${trustAfter})`);
  await p.locator('[data-offer-card][data-store="Salla Shop Mall"] [data-testid=open-detail]').last().click();
  ok(/from 1 Dalil Pi buyer/.test(await p.getByTestId('dalil-reviews').innerText()), 'Dalil Pi buyer review shown');
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // 5) Target price
  await p.getByRole('textbox', { name: 'What do you want to buy with Pi?' }).fill('WOO mug');
  await p.keyboard.press('Enter');
  await p.getByText('Mugs you can buy with Pi').waitFor({ timeout: 30000 });
  await p.locator('[data-offer-card][data-store="Pi Mug Shop"] [data-testid=open-detail]').click();
  await p.getByTestId('target-input').fill('45');
  await p.getByTestId('watch-btn').click();
  await p.getByText("Watching — we'll tell you").waitFor();
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // 6) Ask the shop (registered merchant, auto-approved in this test)
  const reg = await fetch(BASE + '/api/merchants/me', { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Pi Corner Cafe', kind: 'local', country: 'EG', city: 'Cairo', address: '3 Qasr El Nil St', lat: 30.05, lon: 31.24, phone: '+20 100 222 3333', categories: 'coffee', items: [{ title: 'Espresso coffee', price: 1.2 }] }) });
  ok(reg.ok, 'merchant registered');
  await p.getByRole('textbox', { name: 'What do you want to buy with Pi?' }).fill('MERCH coffee');
  await p.keyboard.press('Enter');
  await p.getByText('Merchants shown').waitFor({ timeout: 30000 });
  await p.locator('[data-offer-card][data-store="Pi Corner Cafe"] [data-testid=open-detail]').click();
  ok((await p.getByTestId('whatsapp').getAttribute('href')).startsWith('https://wa.me/201002223333?text='), 'WhatsApp with a ready message');
  await p.getByTestId('ask-shop').click();
  await p.getByTestId('ask-input').fill('Do you have oat milk?');
  await p.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await p.getByText('The answer will appear').waitFor();
  ok(true, 'question sent');
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await p.locator('header').getByRole('button', { name: 'My account' }).click();
  await p.getByRole('tab', { name: 'Messages' }).click();
  const inbox = p.getByTestId('inbox-row').first();
  await inbox.waitFor();
  await inbox.getByTestId('answer-input').fill('Yes, oat milk all day!');
  await inbox.getByRole('button', { name: 'Answer' }).click();
  await p.getByTestId('question-row').filter({ hasText: 'oat milk all day' }).waitFor();
  ok(true, 'merchant answered; buyer sees the answer');
  await p.screenshot({ path: `${OUT}/30-messages.png` });

  // 7) Telegram
  await p.getByRole('tab', { name: 'Preferences' }).click();
  const tg = p.getByTestId('telegram');
  await tg.waitFor();
  await ctx.route(/t\.me/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>tg</h1>' }));
  const [tgPop] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), tg.getByTestId('tg-connect').click()]);
  await tgPop.waitForLoadState().catch(() => {});
  ok(/^https:\/\/t\.me\/DalilPiTestBot\?start=/.test(tgPop.url()), `connect opens the bot link directly (not about:blank): ${tgPop.url()}`);
  await tgPop.close();
  await p.bringToFront();
  ok(!/t\.me/.test(p.url()), 'Dalil Pi stays open behind the bot tab');
  // Pi Browser: the link goes to Pi.openUrlInSystemBrowser, no blank tab
  await p.evaluate(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 PiBrowser/1.0' });
    window.__opened = [];
    window.Pi = { init() {}, authenticate() {}, createPayment() {}, openUrlInSystemBrowser: async (u) => { window.__opened.push(u); } };
  });
  const pages = ctx.pages().length;
  await tg.getByTestId('tg-connect').click();
  await p.waitForTimeout(800);
  const opened = await p.evaluate(() => window.__opened);
  ok((opened.length === 1 && /t\.me\/DalilPiTestBot\?start=/.test(opened[0])) || /t\.me/.test(p.url()), `Pi Browser: bot link handed to the system browser: ${JSON.stringify(opened)} ${p.url()}`);
  ok(ctx.pages().length === pages, 'Pi Browser: no blank tab opened');
  if (/t\.me/.test(p.url())) { await p.goBack(); await p.getByRole('tab', { name: 'Preferences' }).click(); }
  const link = await J(await fetch(BASE + '/api/telegram/link', { method: 'POST', headers: auth }));
  ok(/^https:\/\/t\.me\/DalilPiTestBot\?start=[\w-]{20,}$/.test(link.url), `one-time bot link: ${link.url}`);
  const code = link.url.split('start=')[1];
  ok((await fetch(BASE + '/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' }, body: '{}' })).status === 401, 'webhook rejects a wrong secret');
  await fetch(BASE + '/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'tg-secret' }, body: JSON.stringify({ message: { chat: { id: 777 }, text: `/start ${code}` } }) });
  await p.getByRole('tab', { name: 'Plan' }).click();
  await p.getByRole('tab', { name: 'Preferences' }).click();
  await p.getByTestId('tg-linked').waitFor({ timeout: 8000 });
  ok(true, 'Telegram shows connected');
  let sent = await J(await fetch('http://127.0.0.1:4070/__sent'));
  ok(sent.some((m) => m.chat_id === 777 && /Connected/.test(m.text)), 'bot confirmed the link');
  // price falls under the target → daily job → Telegram digest
  await fetch('http://127.0.0.1:4040/__price', { method: 'POST', body: JSON.stringify({ price: 4400 }) });
  const cron = await J(await fetch(BASE + '/api/cron/daily', { headers: { authorization: 'Bearer cron-test' } }));
  ok(cron.telegram && cron.telegram.sent === 1, `daily job sent the digest: ${JSON.stringify(cron.telegram)}`);
  sent = await J(await fetch('http://127.0.0.1:4070/__sent'));
  const digest = sent.filter((m) => m.chat_id === 777).at(-1)?.text ?? '';
  ok(/Reached your target/.test(digest) && /Pi Mug/.test(digest) && /oat milk all day/.test(digest), 'digest has the target price + the shop answer');
  const cron2 = await J(await fetch(BASE + '/api/cron/daily', { headers: { authorization: 'Bearer cron-test' } }));
  ok(cron2.telegram.sent === 0, 'nothing is sent twice');
  await p.getByRole('tab', { name: 'Watchlist' }).click();
  await p.getByTestId('target-hit').waitFor();
  ok(true, 'watchlist shows "Target reached!"');
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();

  // 8) Deals + for you on a new chat
  await fetch(BASE + '/api/dev/seed-prices', { method: 'POST', body: JSON.stringify([{ url_key: 'piketplace.com/item/jbl-520', day: day(5), price: 600, currency: 'PI', title: 'JBL Tune 520BT', store: 'Piketplace', url: 'https://piketplace.com/item/jbl-520', country: 'EG' }]) });
  await p.goto(BASE + '/?v=ask', { waitUntil: 'networkidle' });
  await p.getByTestId('for-you').waitFor({ timeout: 10000 });
  ok(/Search again: /.test(await p.getByTestId('for-you').innerText()), 'for-you chips from past searches');
  await p.getByTestId('deals').waitFor({ timeout: 10000 });
  ok(/JBL Tune 520BT/.test(await p.getByTestId('deals').innerText()) && /−24%/.test(await p.getByTestId('deals').innerText()), `today's deals: ${(await p.getByTestId('deals').innerText()).replace(/\s+/g, ' ').slice(0, 90)}`);
  await p.screenshot({ path: `${OUT}/31-home.png`, fullPage: true });
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
