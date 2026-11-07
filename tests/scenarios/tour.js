// Runs the judges' guided demo end to end in a real browser and plays the judge:
// whenever the tour says "Your turn", it clicks the highlighted button and approves in PayPal.
// Local (mock PayPal): node tests/scenarios/tour.js
// Live: BASE=https://… REAL=1 PP_USER=… PP_PASS=… node tests/scenarios/tour.js   (credentials from env vars only)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3100';
const REAL = !!process.env.REAL;
const SHOTS = process.env.SHOTS || require('os').tmpdir() + '/dalil-tour';
require('fs').mkdirSync(SHOTS, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

async function paypalApprove(popup, tag) {
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  if (!REAL) return popup.waitForEvent('close', { timeout: 20000 }).catch(() => {});
  const email = popup.locator('#email, input[name=login_email], input[type=email]').first();
  const pw0 = popup.locator('#password, input[name=login_password], input[type=password]').first();
  const review = popup.locator('#payment-submit-btn, button[data-testid=submit-button-initial]').first();
  const first = await Promise.race([
    email.waitFor({ timeout: 45000 }).then(() => 'email'),
    pw0.waitFor({ timeout: 45000 }).then(() => 'password'),
    review.waitFor({ timeout: 45000 }).then(() => 'review'),
  ]).catch(() => 'none');
  if (first !== 'review') {
    if (first === 'email') await email.fill(process.env.PP_USER);
    const next = popup.locator('#btnNext');
    if (await next.isVisible().catch(() => false)) await next.click();
    const pw = popup.locator('#password, input[name=login_password], input[type=password]').first();
    await pw.waitFor({ timeout: 25000 });
    await pw.fill(process.env.PP_PASS);
    await popup.getByRole('button', { name: /^(Log In|Login)$/ }).click();
  }
  const pay = popup
    .locator('#payment-submit-btn, button[data-testid=submit-button-initial], button:has-text("Complete Purchase"), button:has-text("Continue to Review Order"), button:has-text("Pay Now"), button:has-text("Continue"), button:has-text("Agree & Continue")')
    .first();
  await pay.waitFor({ timeout: 60000 });
  await popup.waitForTimeout(1500);
  await popup.screenshot({ path: `${SHOTS}/${tag}-paypal.png` }).catch(() => {});
  await pay.click();
  await popup.waitForEvent('close', { timeout: 60000 }).catch(() => log('  popup did not close by itself'));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '/?demo=1');
  const panel = page.locator('[aria-label="Guided demo"]');
  await panel.waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${SHOTS}/00-intro.png` });
  await page.getByRole('button', { name: 'Start the demo' }).click();

  let lastTitle = '';
  let turns = 0;
  const deadline = Date.now() + 20 * 60_000;
  let result = 'timeout';
  while (Date.now() < deadline) {
    const txt = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const title = (txt.match(/Step \d+ of \d+ (.+?)(?: Your turn| Dalil| Blocked| Deal| The | A | Price| Paid| Mom| Captured| Multi| Not| Group| Purchases| From| \d+ live| Your)/) || [])[1] || txt.slice(0, 60);
    if (/^Done|That's Dalil/.test(txt)) {
      result = 'done';
      break;
    }
    if (/Run the demo again/.test(txt)) {
      result = 'error: ' + txt;
      break;
    }
    const stepNo = (txt.match(/Step (\d+) of/i) || [])[1];
    if (stepNo && stepNo !== lastTitle) {
      lastTitle = stepNo;
      log(`step ${stepNo}: ${txt.slice(0, 160)}`);
      await page.screenshot({ path: `${SHOTS}/step-${String(stepNo).padStart(2, '0')}.png` });
    }
    if (/Your turn/.test(txt)) {
      turns++;
      // the highlighted button may be on the page or inside the approver frame
      const inFrame = page.frameLocator('iframe[name="dalil-demo-approver"]').locator('.tour-spot');
      const target = (await page.locator('.tour-spot').count()) ? page.locator('.tour-spot').first() : inFrame.first();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/turn-${turns}.png` });
      const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), target.click()]);
      log(`  judge clicked (turn ${turns}) → PayPal`);
      await paypalApprove(popup, `turn-${turns}`);
      // wait until the tour moves on
      for (let i = 0; i < 120 && /Your turn/.test((await panel.innerText().catch(() => '')) || ''); i++) await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `${SHOTS}/zz-end.png` });
  log('RESULT:', result, '| PayPal approvals by the judge:', turns, '| page errors:', errs.length ? errs : 0);
  await browser.close();
  process.exit(result === 'done' && !errs.length ? 0 : 1);
})();
