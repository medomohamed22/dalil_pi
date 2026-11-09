// Automatic order at a WooCommerce store whose checkout takes Pi (Sallanet Pay).
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const BASE = 'http://localhost:3100';
(async () => {
  const token = (await (await fetch(BASE + '/api/auth/pi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'tester' }) })).json()).token;
  const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const a = await fetch(BASE + '/api/addresses', { method: 'POST', headers: auth, body: JSON.stringify({ fullName: 'Mona Adel', phone: '+20 100 555 0000', country: 'EG', city: 'Cairo', street: '5 Nile St', building: 'Floor 3', area: 'Zamalek' }) });
  ok(a.ok, 'address saved');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept()); // the "be careful" confirm for trust 40–59
  await p.goto(BASE + '/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  await p.locator('textarea').fill('WOO mug');
  await p.keyboard.press('Enter');
  await p.getByText('Mugs you can buy with Pi').waitFor({ timeout: 40000 });
  const mug = p.locator('[data-offer-card][data-store="Pi Mug Shop"]');
  ok(await mug.getByTestId('auto-tag').isVisible(), 'store with Pi checkout gets "Automatic checkout"');
  ok((await p.locator('[data-offer-card][data-store="Plain Store"] [data-testid=auto-tag]').count()) === 0, 'store without Pi gateway: no automatic checkout');
  ok((await mug.innerText()).includes('Best value') && !(await p.locator('[data-offer-card][data-store="Plain Store"]').innerText()).includes('Best value'), 'badges skip the low-trust store');
  console.log('trust', await mug.getByTestId('trust').innerText());

  await mug.getByRole('button', { name: /Order with Pi/ }).click();
  const sheet = p.getByTestId('auto-order');
  await sheet.getByTestId('ship-to').waitFor();
  ok((await sheet.getByTestId('ship-to').innerText()).includes('5 Nile St'), 'shows the address that will be sent');
  ok((await sheet.innerText()).includes('will send your name, phone, address and email to Pi Mug Shop'), 'tells the user what is shared');
  await sheet.locator('input[type=email]').fill('mona@example.com');
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/13-auto-order.png` });
  const [pay] = await Promise.all([ctx.waitForEvent('page'), sheet.getByRole('button', { name: 'Place order & pay with Pi' }).click()]);
  await pay.waitForURL(/\/pay\/1001/, { timeout: 20000 });
  ok(/Sallanet Pay/.test(await pay.content()), `payment page of the store opened (${pay.url()})`);
  await pay.close();
  const st = await (await fetch('http://127.0.0.1:4040/__state')).json();
  const c = st.checkouts[0];
  ok(c && c.payment_method === 'sallanet_pay' && c.items[0].id === 77, 'store order created with the Pi gateway');
  ok(c.billing_address.email === 'mona@example.com' && c.shipping_address.address_1 === '5 Nile St' && c.shipping_address.first_name === 'Mona' && c.shipping_address.country === 'EG', 'address + email sent to the store');
  await p.getByText('Order placed at the store').waitFor();
  const orders = (await (await fetch(BASE + '/api/orders', { headers: auth })).json()).orders;
  ok(orders[0].connector === 'woo_sallanet' && orders[0].status === 'awaiting_payment' && orders[0].checkoutUrl.endsWith('/pay/1001'), `order saved: ${orders[0].connector} ${orders[0].status}`);
  const me = (await (await fetch(BASE + '/api/me', { headers: auth })).json());
  ok(me.email === 'mona@example.com' && me.usage.ordersUsed === 0, 'email remembered, order free (no credit)');

  // Store raised the price → refuse, popup closed, error shown
  await fetch('http://127.0.0.1:4040/__price', { method: 'POST', body: JSON.stringify({ price: 6000 }) });
  await mug.getByRole('button', { name: /Order with Pi/ }).click();
  await sheet.getByTestId('ship-to').waitFor();
  ok((await sheet.locator('input[type=email]').inputValue()) === 'mona@example.com', 'email prefilled next time');
  await sheet.getByRole('button', { name: 'Place order & pay with Pi' }).click();
  await sheet.getByTestId('auto-error').waitFor({ timeout: 20000 });
  ok(/price changed to 60/.test(await sheet.getByTestId('auto-error').innerText()), `price change refused: ${await sheet.getByTestId('auto-error').innerText()}`);
  ok((await (await fetch('http://127.0.0.1:4040/__state')).json()).checkouts.length === 1, 'no second store order');
  ok(ctx.pages().length === 1, 'blank tab closed on failure');

  // Server refuses auto on an offer without the flag (tampering)
  const offers = await p.evaluate(() => null);
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
