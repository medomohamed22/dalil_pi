// Sign-in, language/RTL, country from IP, first AI answer with offers.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG', 'x-vercel-ip-city': 'Cairo' } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  ok(await p.getByText('Sign in with Pi', { exact: true }).first().isVisible(), 'sign-in screen shown first (English default)');
  ok((await p.getAttribute('html', 'dir')) === 'ltr', 'page is LTR in English');
  ok(await p.getByRole('button', { name: /Country/ }).innerText().then((t) => t.includes('EG') || t.includes('Egypt')), 'country chip shows Egypt from IP');
  await p.screenshot({ path: `${OUT}/1-signin.png` });

  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  ok(true, 'dev sign-in works');
  ok((await p.getByTestId('usage').innerText()).includes('2 of 2'), 'usage shows 2 of 2 searches left');

  // Search 1
  await p.locator('textarea').fill('Wireless headphones under 500 Pi');
  await p.keyboard.press('Enter');
  await p.locator('[data-offer-card]').first().waitFor({ timeout: 30000 });
  await p.getByText('Best pick').waitFor({ timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('[data-testid=usage]')?.textContent?.includes('1 of 2'), null, { timeout: 15000 });
  const cards = await p.locator('[data-offer-card]').count();
  ok(cards === 3, `3 offer cards (${cards})`);
  const firstStore = await p.locator('[data-offer-card]').first().getAttribute('data-store');
  ok(firstStore !== 'Random Shop', `Pi-priced store ranked first (${firstStore})`);
  const body = await p.locator('main').innerText();
  ok(/455 π/.test(body) && /≈ \$/.test(body), 'Pi price and ≈ USD shown');
  ok((await p.locator('[data-testid=trust]').count()) >= 2, 'trust score shown on cards');
  ok(body.includes('Not priced in Pi'), 'non-Pi offer flagged');
  ok(!body.includes('Price not confirmed'), 'Pi prices grounded by search evidence');
  ok((await p.getByTestId('usage').innerText()).includes('1 of 2'), 'usage decremented after search');
  await p.screenshot({ path: `${OUT}/2-results.png`, fullPage: false });

  // Switch to Arabic
  await p.getByRole('button', { name: 'Language' }).click();
  await p.waitForFunction(() => document.documentElement.dir === 'rtl');
  ok(true, 'Arabic switches page to RTL');
  ok((await p.locator('main').innerText()).includes('بيقبل باي'), 'cards in Arabic');
  await p.screenshot({ path: `${OUT}/3-arabic.png` });

  // Change country to United States
  await p.getByRole('button', { name: 'البلد' }).click();
  await p.getByRole('dialog').getByPlaceholder('البلد').fill('United States');
  await p.getByRole('dialog').getByRole('button', { name: /الولايات المتحدة/ }).first().click();
  ok((await p.getByRole('button', { name: 'البلد' }).innerText()).includes('US') || (await p.getByRole('button', { name: 'البلد' }).innerText()).includes('الولايات'), 'country changed to US');

  // Search 2 (new chat) uses US in the prompt
  await p.locator('textarea').fill('phone charger');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('[data-testid=usage]')?.textContent?.includes('0'), null, { timeout: 30000 });
  const prompts = await (await fetch('http://127.0.0.1:4020/__prompts')).json();
  ok(prompts[0].includes('Egypt (EG)') && prompts[0].includes('Cairo'), 'first prompt used Egypt + Cairo from IP');
  ok(prompts[1].includes('United States (US)') && prompts[1].includes('Arabic'), 'second prompt used picked country US and Arabic');
  ok(prompts[0].includes('1 PI ≈ $'), 'prompt has live OKX Pi price');

  // Credit used up → the chat box becomes the AI paywall, no 3rd AI call possible
  await p.getByTestId('ai-paywall').waitFor({ timeout: 15000 });
  ok((await p.locator('textarea').count()) === 0, 'no AI credit left → paywall instead of the chat box');
  const prompts2 = await (await fetch('http://127.0.0.1:4020/__prompts')).json();
  ok(prompts2.length === 2, 'quota blocks the AI call (no 3rd prompt)');
  await p.screenshot({ path: `${OUT}/4-quota.png` });

  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})();
