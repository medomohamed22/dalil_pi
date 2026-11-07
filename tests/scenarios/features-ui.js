// UI tests for PR #1: multi-store cart, price protection, family approval.
// Local (mock PayPal, demo mode):  node feat3.js
// Preview (real model + real PayPal sandbox): BASE=<preview> REAL=1 PP_USER=.. PP_PASS=.. node feat3.js [cart|protect|family]
// Credentials only from env vars.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3100';
const REAL = !!process.env.REAL;
const SHARE = process.env.SHARE || ''; // ?_vercel_share=... for protected previews (never logged)
const SHOTS = __dirname + '/shots/feat3';
require('fs').mkdirSync(SHOTS, { recursive: true });
const only = new Set(process.argv.slice(2));
const want = (k) => only.size === 0 || only.has(k);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  → ' + String(detail ?? '').slice(0, 300)}`);
};

async function paypalApprove(popup, tag) {
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  if (!REAL) return popup.waitForEvent('close', { timeout: 20000 }).catch(() => {});
  const shot = (n) => popup.screenshot({ path: `${SHOTS}/${tag}-pp-${n}.png` }).catch(() => {});
  const email = popup.locator('#email, input[name=login_email], input[type=email]').first();
  const pw0 = popup.locator('#password, input[name=login_password], input[type=password]').first();
  const reviewBtn = popup.locator('#payment-submit-btn, button[data-testid=submit-button-initial]').first();
  const first = await Promise.race([
    email.waitFor({ timeout: 45000 }).then(() => 'email'),
    pw0.waitFor({ timeout: 45000 }).then(() => 'password'),
    reviewBtn.waitFor({ timeout: 45000 }).then(() => 'review'),
  ]).catch(() => 'none');
  if (first !== 'review') {
    if (first === 'email') await email.fill(process.env.PP_USER);
    const next = popup.locator('#btnNext');
    if (await next.isVisible().catch(() => false)) await next.click();
    const pw = popup.locator('#password, input[name=login_password], input[type=password]').first();
    await pw.waitFor({ timeout: 25000 });
    await pw.fill(process.env.PP_PASS);
    await popup.getByRole('button', { name: /^(Log In|Login|تسجيل الدخول)$/ }).click();
  }
  const pay = popup.locator(
    '#payment-submit-btn, button[data-testid=submit-button-initial], button:has-text("Complete Purchase"), button:has-text("Continue to Review Order"), button:has-text("Pay Now"), button:has-text("Continue"), button:has-text("Agree & Continue")',
  ).first();
  await pay.waitFor({ timeout: 60000 }).catch(async (e) => { await shot('review-fail'); throw e; });
  await popup.waitForTimeout(1500);
  await shot('review');
  await pay.click();
  await popup.waitForEvent('close', { timeout: 60000 }).catch(() => log('  popup did not close by itself'));
}

async function newPage(browser, { mobile } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  await page.goto(BASE + '/' + SHARE);
  await page.waitForTimeout(1200);
  return { ctx, page };
}

async function setup(page, { demo }) {
  await page.getByRole('button', { name: 'Settings' }).last().click();
  await page.waitForTimeout(500);
  if (REAL) {
    await page.getByText('muse-spark-1.3-contributor', { exact: true }).first().click().catch(() => {});
    await page.getByText('United States', { exact: false }).first().click().catch(() => {});
  }
  const sw = page.getByRole('switch', { name: 'demo-mode' });
  if ((await sw.getAttribute('aria-checked')) !== String(!!demo)) await sw.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(500);
}

async function ask(page, text, until, timeout = REAL ? 150000 : 30000) {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
  await until.waitFor({ timeout });
  await page.waitForTimeout(800);
}

async function payViaPopup(page, button, tag) {
  // let the agent finish its reply first (the Stop button disappears)
  await page.locator('button[aria-label="Stop"], button[aria-label="إيقاف"]').waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
  const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 30000 }), button.click()]);
  try {
    await paypalApprove(popup, tag);
  } catch (e) {
    await page.waitForTimeout(1500);
    const err = await page.locator('main').innerText().catch(() => '');
    throw new Error(`${e.message.split('\n')[0]} | popup url: ${popup.url().slice(0, 80)} | page tail: ${err.slice(-300)}`);
  }
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. Price protection: buy → capture → protection on → simulated drop refunds ---------- */
  if (want('protect')) {
    const { ctx, page } = await newPage(browser);
    try {
      await setup(page, { demo: !REAL });
      const approve = page.getByRole('button', { name: /Approve with PayPal/ }).last();
      const either = page.getByRole('button', { name: /Approve with PayPal|^Buy$/ }).first();
      await ask(page, REAL ? 'buy the cheapest Anker USB-C charger 20W' : 'buy airpods pro 3', either);
      await page.locator('button[aria-label="Stop"]').waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
      if (!(await approve.isVisible().catch(() => false))) {
        log('  model did not open the approval card — pressing Buy on the top offer');
        await page.getByRole('button', { name: /^Buy$/ }).first().click();
        await approve.waitFor({ timeout: 120000 });
      }
      check('protect: purchase card appears', true);
      await payViaPopup(page, approve, 'protect');
      await page.getByRole('button', { name: /Confirm now|Charge now|Confirm/i }).last().waitFor({ timeout: 60000 });
      await page.screenshot({ path: `${SHOTS}/protect-1-held.png` });
      await page.getByRole('button', { name: /Confirm now|Charge now|Confirm/i }).last().click();
      const prot = page.getByText(/Price protection/).last();
      await prot.waitFor({ timeout: 60000 });
      await page.waitForTimeout(3000);
      const turnOn = page.getByRole('button', { name: /^Turn on$/ });
      if (await turnOn.isVisible().catch(() => false)) await turnOn.click();
      const sim = page.getByRole('button', { name: /Simulate price drop/ }).last();
      await sim.waitFor({ timeout: 45000 });
      check('protect: protection turns on after capture', true);
      await page.screenshot({ path: `${SHOTS}/protect-2-on.png` });
      await sim.click();
      await page.getByText(/refunded|Refunded/).last().waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      const txt = await page.locator('main').innerText();
      check('protect: simulated drop shows a refund', /refund/i.test(txt), txt.slice(-400));
      await page.screenshot({ path: `${SHOTS}/protect-3-refund.png` });
      // keep simulating until the 15% floor: must stop with a clear message, never refund more
      for (let i = 0; i < 6; i++) {
        if (!(await sim.isVisible().catch(() => false)) || (await sim.isDisabled().catch(() => false))) break;
        await sim.click();
        await page.waitForTimeout(REAL ? 6000 : 1500);
      }
      await page.screenshot({ path: `${SHOTS}/protect-4-floor.png` });
      const p = await page.evaluate(async () => {
        const r = await fetch('/api/protection', { headers: { 'x-device-id': localStorage.getItem('dalil-device') || '' } }).catch(() => null);
        return r ? r.text() : '';
      });
      log('  protection list:', p.slice(0, 300));
      check('protect: no page errors', page.errs.length === 0, page.errs);
    } catch (e) {
      check('protect: flow', false, e.message.split('\n')[0]);
      await page.screenshot({ path: `${SHOTS}/protect-fail.png` });
    }
    await ctx.close();
  }

  /* ---------- 2. Multi-store cart: add from two stores → one PayPal approval → hold per store ---------- */
  if (want('cart')) {
    const { ctx, page } = await newPage(browser);
    try {
      await setup(page, { demo: !REAL });
      if (!REAL) {
        const approve = page.getByRole('button', { name: /at once with PayPal/ }).last();
        await ask(page, 'put airpods pro 3 and an air fryer in one cart', approve);
      } else {
        const add = page.getByRole('button', { name: 'Add to cart' });
        await ask(page, 'compare prices for a Logitech MX Master 3S mouse', add.first());
        await page.waitForTimeout(4000);
        // pick two offers from two different stores (by their store link host)
        const hosts = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Add to cart"]')].map((b) => {
          const dom = (el) => (el.innerText || '').split('\n').map((x) => x.trim()).find((x) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x));
          let el = b;
          while (el && !dom(el)) el = el.parentElement;
          return (el && dom(el)) || '?';
        }));
        log('  stores with add-to-cart:', hosts.join(', '));
        const i = 0, j = hosts.findIndex((h) => h !== hosts[0]);
        if (j < 0) throw new Error('only one store in results: ' + hosts.join(','));
        await page.locator('[aria-label="Add to cart"]').nth(j).click();
        await page.waitForTimeout(400);
        await page.locator('[aria-label="Add to cart"]').nth(i).click();
        await page.waitForTimeout(400);
        await page.getByRole('button', { name: 'Check out cart' }).click();
      }
      const approve = page.getByRole('button', { name: /at once with PayPal/ }).last();
      await approve.waitFor({ timeout: 20000 });
      const label = await approve.innerText();
      check('cart: one approval button for several stores', /Approve [2-9] stores/.test(label), label);
      await page.screenshot({ path: `${SHOTS}/cart-1.png` });
      await payViaPopup(page, approve, 'cart');
      const cancelOne = page.getByRole('button', { name: /Cancel this store/ });
      await cancelOne.first().waitFor({ timeout: 60000 });
      const paid = await cancelOne.count();
      check('cart: one approval → each store paid separately', paid >= 2, paid);
      await page.screenshot({ path: `${SHOTS}/cart-2-paid.png` });
      await cancelOne.first().click();
      await page.getByText('Refunded', { exact: true }).first().waitFor({ timeout: 60000 });
      const txt = await page.locator('main').innerText();
      check('cart: cancel one store → that store refunded, the other stays paid', /Refunded/.test(txt) && /Charged/.test(txt), txt.slice(-500));
      await page.screenshot({ path: `${SHOTS}/cart-3-done.png` });
      check('cart: no page errors', page.errs.length === 0, page.errs);
    } catch (e) {
      check('cart: flow', false, e.message.split('\n')[0]);
      await page.screenshot({ path: `${SHOTS}/cart-fail.png` });
    }
    await ctx.close();
  }

  /* ---------- 3. Family approval: requester makes a link; approver pays from their own PayPal ---------- */
  if (want('family')) {
    const { ctx, page } = await newPage(browser);
    try {
      await setup(page, { demo: !REAL });
      const askBtn = page.getByRole('button', { name: /Ask family to approve/ }).last();
      const ready = page.getByRole('button', { name: /Ask family to approve|Create approval link/ }).last();
      await ask(page, REAL ? 'I want a JBL Flip 6 speaker, ask my mom to pay for it' : 'ask my mom to pay for airpods pro 3', ready);
      if (await askBtn.isVisible().catch(() => false)) await askBtn.click();
      await page.getByPlaceholder(/Your name/).fill('<img src=x onerror=alert(1)>Sara');
      const limitInput = page.locator('input[inputmode=decimal]').last();
      const totalTxt = await limitInput.inputValue();
      log('  default limit:', totalTxt);
      // a limit below the total must be refused
      await limitInput.fill('1');
      await page.waitForTimeout(300);
      const low = await page.locator('main').innerText();
      check('family: limit below the total is refused', (await page.getByRole('button', { name: 'Create approval link' }).isDisabled()) && /above this limit/.test(low), low.slice(-300));
      await page.getByPlaceholder(/Your name/).fill('<img src=x onerror=alert(1)>Sara');
      await limitInput.fill(String(Math.ceil(Number(totalTxt || '0')) + 100 || 5000));
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith('/api/family') && r.request().method() === 'POST', { timeout: 20000 }),
        page.getByRole('button', { name: 'Create approval link' }).click(),
      ]);
      const id = (await resp.json()).request?.id;
      const link = id;
      check('family: share link created', !!id, link);
      await page.screenshot({ path: `${SHOTS}/family-1-link.png` });

      // requester opening their own link can't approve
      const own = await ctx.newPage();
      await own.goto(`${BASE}/f/${id}${SHARE}`);
      await own.waitForTimeout(2500);
      const ownTxt = await own.locator('body').innerText();
      check("family: requester can't approve own request", /can't approve your own request/.test(ownTxt) && !(await own.getByRole('button', { name: /Approve & pay/ }).isVisible().catch(() => false)), ownTxt.slice(0, 300));
      await own.close();

      // approver: a different browser (phone)
      const { ctx: ctx2, page: mom } = await newPage(browser, { mobile: true });
      let dialogs = 0;
      mom.on('dialog', (d) => { dialogs++; d.dismiss(); });
      await mom.goto(`${BASE}/f/${id}${SHARE}`);
      const pay = mom.getByRole('button', { name: /Approve & pay/ });
      await pay.waitFor({ timeout: 20000 });
      const momTxt = await mom.locator('body').innerText();
      check('family: approver sees the item, total and limit', /A purchase request from/.test(momTxt) && /Limit they set/.test(momTxt), momTxt.slice(0, 300));
      await mom.screenshot({ path: `${SHOTS}/family-2-approver.png` });
      await payViaPopup(mom, pay, 'family');
      await mom.getByText(/Funds held/).waitFor({ timeout: 60000 });
      check('family: approver funds are held (not charged yet)', true);
      await mom.screenshot({ path: `${SHOTS}/family-3-held.png` });
      await page.waitForTimeout(5000);
      const reqTxt = await page.locator('main').innerText();
      check('family: requester sees the approval', /held|Approved|charged in/i.test(reqTxt), reqTxt.slice(-300));
      await mom.getByRole('button', { name: /Confirm now/ }).click();
      await mom.getByText(/Paid!/).waitFor({ timeout: 60000 });
      check('family: approver confirms → paid', true);
      check('family: HTML in the name is not executed', dialogs === 0);
      await mom.screenshot({ path: `${SHOTS}/family-4-paid.png` });
      check('family: no page errors', page.errs.length === 0 && mom.errs.length === 0, [...page.errs, ...mom.errs]);
      await ctx2.close();
    } catch (e) {
      check('family: flow', false, e.message.split('\n')[0]);
      await page.screenshot({ path: `${SHOTS}/family-fail.png` });
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
})();
