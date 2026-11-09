// Paid plans: Pi payment flow with a fake Pi SDK + mock Pi Platform API.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const BASE = 'http://localhost:3100';
const PI = 'http://localhost:4030';
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const fakeSdk = () => {
  const PI = 'http://localhost:4030';
  window.Pi = {
    init() {},
    async authenticate(scopes, onIncomplete) { window.__scopes = scopes; if (window.__stuck) onIncomplete(window.__stuck); return { accessToken: 'fake', user: { uid: 'dev-tester' } }; },
    createPayment(data, cb) {
      (async () => {
        if (window.__cancelNext) { window.__cancelNext = false; return cb.onCancel('none'); }
        const { id } = await (await fetch(PI + '/__create', { method: 'POST', body: JSON.stringify({ ...data, uid: 'dev-tester' }) })).json();
        window.__lastPay = id;
        if (window.__tamper) { window.__tamper = false; await fetch(PI + '/__tamper', { method: 'POST', body: JSON.stringify({ id, amount: 0.1 }) }); }
        cb.onReadyForServerApproval(id);
        for (let i = 0; i < 40; i++) {
          const p = await (await fetch(PI + '/__get?id=' + id)).json();
          if (p.status.developer_approved) break;
          await new Promise((r) => setTimeout(r, 150));
        }
        const r = await fetch(PI + '/__sign', { method: 'POST', body: JSON.stringify({ id }) });
        if (!r.ok) return cb.onError(new Error('user could not sign: not approved'));
        const { txid } = await r.json();
        cb.onReadyForServerCompletion(id, txid);
      })();
    },
  };
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  await ctx.addInitScript(fakeSdk);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE + '/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  const token = (await j(await fetch(BASE + '/api/auth/pi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 'tester' }) }))).body.token;
  const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  // Live prices
  const plans = (await j(await fetch(BASE + '/api/plans', { headers: auth }))).body;
  const basic = plans.plans.find((x) => x.id === 'basic');
  ok(plans.rate > 0 && basic.amountPi === Math.ceil((1.99 / plans.rate) * 10 - 1e-9) / 10, `basic priced from OKX: ${basic.amountPi} π @ ${plans.rate}`);
  ok(plans.plans.map((x) => x.id).join() === 'basic,plus,pro,topup' && plans.plans.every((x) => x.days === 30), 'four plans, all 30 days');

  await p.locator('header').getByRole('button', { name: 'My account' }).click();
  const acc = p.getByRole('dialog', { name: 'My account' });
  await acc.getByTestId('plan-offer').first().waitFor();
  ok((await acc.getByTestId('plan-offer').count()) === 4, 'plan shop lists 4 plans');
  ok(/Free/.test(await acc.getByTestId('current-plan').innerText()), 'starts on Free');
  ok(/30 days\. AI requests you don't use expire/.test(await acc.innerText()), 'expiry rule is shown');
  await p.screenshot({ path: `${OUT}/8-plans.png` });

  // 1) user cancels in the Pi wallet
  await p.evaluate(() => (window.__cancelNext = true));
  await acc.locator('[data-plan="basic"] button').click();
  await acc.getByTestId('pay-msg').waitFor();
  ok(/cancelled/i.test(await acc.getByTestId('pay-msg').innerText()), 'cancel → "Payment cancelled."');

  // 2) amount tampered → server refuses to approve
  await p.evaluate(() => (window.__tamper = true));
  await acc.locator('[data-plan="basic"] button').click();
  await p.waitForFunction(() => /failed/i.test(document.querySelector('[data-testid=pay-msg]')?.textContent || ''), null, { timeout: 15000 });
  ok(/doesn't match/.test(await acc.getByTestId('pay-msg').innerText()), `tampered amount rejected: ${await acc.getByTestId('pay-msg').innerText()}`);
  const tamperedId = await p.evaluate(() => window.__lastPay);
  const tampered = await (await fetch(`${PI}/__get?id=${tamperedId}`)).json();
  ok(!tampered.status.developer_approved, 'tampered payment never approved');

  // 3) real purchase
  await acc.locator('[data-plan="basic"] button').click();
  await p.waitForFunction(() => /Done!/.test(document.querySelector('[data-testid=pay-msg]')?.textContent || ''), null, { timeout: 20000 });
  ok(true, `paid: ${await acc.getByTestId('pay-msg').innerText()}`);
  ok(/Basic/.test(await acc.getByTestId('current-plan').innerText()), 'plan is now Basic');
  const pack = await acc.getByTestId('pack').first().innerText();
  const in30 = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  ok(pack.includes('60 AI requests left') && pack.includes(in30), `pack shows 60/60 and expiry ${in30}: ${pack}`);
  ok((await p.evaluate(() => window.__scopes)).includes('payments'), 'asked Pi for the payments scope');
  await p.screenshot({ path: `${OUT}/9-paid.png` });
  const paidId = await p.evaluate(() => window.__lastPay);
  const paid = await (await fetch(`${PI}/__get?id=${paidId}`)).json();
  ok(paid.status.developer_approved && paid.status.developer_completed, 'Pi payment approved + completed');
  // Same plan can't be bought again while active; other plans and top-ups stay available
  await acc.locator('[data-plan="basic"][data-active="1"]').waitFor({ timeout: 10000 });
  const basicBtn = acc.locator('[data-plan="basic"] button');
  ok(await basicBtn.isDisabled() && (await basicBtn.innerText()).includes('Active'), 'Basic button greyed out: "Active"');
  ok(/subscribed until/.test(await acc.locator('[data-plan="basic"]').innerText()), 'shows "subscribed until <date>"');
  ok(!(await acc.locator('[data-plan="plus"] button').isDisabled()) && !(await acc.locator('[data-plan="topup"] button').isDisabled()), 'Plus and Top-up still available');
  const again2 = (await (await fetch(`${PI}/__create`, { method: 'POST', body: JSON.stringify({ uid: 'dev-tester', amount: basic.amountPi, memo: 'x', metadata: { plan: 'basic', quote: basic.quote } }) })).json()).id;
  const dup = await j(await fetch(BASE + '/api/payments/approve', { method: 'POST', headers: auth, body: JSON.stringify({ paymentId: again2 }) }));
  ok(dup.status === 409 && dup.body.code === 'ALREADY_SUBSCRIBED', `server refuses a 2nd Basic with an old quote (${dup.status} ${dup.body.code})`);
  const fresh = (await j(await fetch(BASE + '/api/plans', { headers: auth }))).body.plans;
  ok(fresh.find((x) => x.id === 'basic').quote === null && !!fresh.find((x) => x.id === 'basic').activeUntil && fresh.find((x) => x.id === 'plus').quote, 'no quote for the active plan, quotes for the rest');

  // 4) replaying completion doesn't add a second pack
  const again = await j(await fetch(BASE + '/api/payments/complete', { method: 'POST', headers: auth, body: JSON.stringify({ paymentId: paidId }) }));
  ok(again.status === 200 && again.body.usage.packs.length === 1, `replay is idempotent (packs=${again.body.usage?.packs?.length})`);
  ok(again.body.usage.searchLimit === 62 && again.body.usage.orderLimit === 62, `limits = free 2 + 60 (${again.body.usage.searchLimit}/${again.body.usage.orderLimit})`);

  // 5) another user's payment can't be approved/completed with my session
  const other = (await (await fetch(`${PI}/__create`, { method: 'POST', body: JSON.stringify({ uid: 'dev-other', amount: basic.amountPi, memo: 'x', metadata: { plan: 'basic', quote: basic.quote } }) })).json()).id;
  const steal = await j(await fetch(BASE + '/api/payments/approve', { method: 'POST', headers: auth, body: JSON.stringify({ paymentId: other }) }));
  ok(steal.status === 403, `other user's payment rejected (${steal.status})`);
  const stealC = await j(await fetch(BASE + '/api/payments/complete', { method: 'POST', headers: auth, body: JSON.stringify({ paymentId: other }) }));
  ok(stealC.status === 404 || stealC.status === 403, `other user's payment can't complete (${stealC.status})`);
  // forged quote
  const forged = (await (await fetch(`${PI}/__create`, { method: 'POST', body: JSON.stringify({ uid: 'dev-tester', amount: 0.1, memo: 'x', metadata: { plan: 'pro', quote: basic.quote.slice(0, -3) + 'abc' } }) })).json()).id;
  const f = await j(await fetch(BASE + '/api/payments/approve', { method: 'POST', headers: auth, body: JSON.stringify({ paymentId: forged }) }));
  ok(f.status === 409 || f.status === 400, `forged quote rejected (${f.status} ${f.body.error})`);
  // plan swapped with a valid quote of another plan
  const swapped = (await (await fetch(`${PI}/__create`, { method: 'POST', body: JSON.stringify({ uid: 'dev-tester', amount: basic.amountPi, memo: 'x', metadata: { plan: 'pro', quote: basic.quote } }) })).json()).id;
  const sw = await j(await fetch(BASE + '/api/payments/approve', { method: 'POST', headers: auth, body: JSON.stringify({ paymentId: swapped }) }));
  ok(sw.status === 400, `plan swap rejected (${sw.status} ${sw.body.error})`);
  // unauthenticated
  ok((await fetch(BASE + '/api/plans')).status === 401, 'plans need sign-in');

  // 6) stuck payment on next sign-in: unpaid one gets cancelled
  const stuck = (await (await fetch(`${PI}/__create`, { method: 'POST', body: JSON.stringify({ uid: 'dev-tester', amount: 1, memo: 'x', metadata: {} }) })).json()).id;
  const inc = await j(await fetch(BASE + '/api/payments/incomplete', { method: 'POST', headers: auth, body: JSON.stringify({ paymentId: stuck }) }));
  ok(inc.body.result === 'cancelled', `unpaid stuck payment cancelled (${inc.body.result})`);

  // 7) usage: free credits (expire end of month) are used before the 30-day pack
  await acc.getByRole('button', { name: 'Close' }).click();
  for (let i = 0; i < 3; i++) {
    await p.locator('textarea').fill(`Wireless headphones ${i}`);
    await p.keyboard.press('Enter');
    await p.waitForFunction((n) => document.querySelectorAll('[data-offer-card]').length >= 3 * (n + 1) && !document.querySelector('[aria-label="Stop"]'), i, { timeout: 30000 });
    await p.waitForTimeout(700);
  }
  const me = (await j(await fetch(BASE + '/api/me', { headers: auth }))).body;
  ok(me.usage.searchesUsed === 3 && me.usage.packs[0].searchesLeft === 59, `3 searches: 2 free + 1 from pack (pack left ${me.usage.packs[0].searchesLeft})`);
  ok(/59 of 62 AI requests left/.test(await p.getByTestId('usage').innerText()), `pill: ${await p.getByTestId('usage').innerText()}`);
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);

  // Arabic view of the plan tab
  await p.locator('header').getByRole('button', { name: 'Language' }).first().click();
  await p.locator('header').getByRole('button', { name: /حسابي/ }).click();
  await p.getByTestId('plan-offer').first().waitFor();
  await p.screenshot({ path: `${OUT}/10-plans-ar.png` });
  ok(/صلاحيتها 30 يوم/.test(await p.getByRole('dialog').innerText()), 'Arabic expiry note');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
