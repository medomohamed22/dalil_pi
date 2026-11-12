// UI batch: tour, detail sheet, compare, twins, follow-up chips, retry, offline banner, count-up.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  const tour = p.getByTestId('tour');
  await tour.waitFor({ timeout: 8000 });
  ok(/Ask for anything/.test(await tour.innerText()), 'tour step 1');
  await p.screenshot({ path: `${OUT}/18-tour.png` });
  await tour.getByRole('button', { name: 'Next' }).click();
  ok(/trust score/.test(await p.getByTestId('tour').innerText()), 'tour step 2');
  await p.getByTestId('tour').getByRole('button', { name: 'Next' }).click();
  await p.getByTestId('tour').getByRole('button', { name: 'Start' }).click();
  await p.waitForTimeout(500);
  ok((await p.getByTestId('tour').count()) === 0, 'tour closes');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  ok((await p.getByTestId('tour').count()) === 0, 'tour shown only once');

  await p.locator('textarea').fill('TWIN headphones');
  await p.keyboard.press('Enter');
  await p.getByText('Twin result').first().waitFor({ timeout: 30000 });
  // count-up ends at the real number
  await p.waitForTimeout(900);
  const tr = await p.locator('[data-testid=trust]').first().innerText();
  ok(/\d+/.test(tr) && Number(tr.trim()) > 0, `trust count-up settles (${tr.trim()})`);
  // twins
  const twin = await p.getByTestId('twin').allInnerTexts();
  ok(twin.some((t) => /Also at Piketplace/.test(t)), `same product in another store: ${twin.join(' | ')}`);
  // detail sheet
  await p.locator('[data-offer-card][data-store="Salla Shop Mall"] [data-testid=open-detail]').click();
  const d = p.getByTestId('offer-detail');
  await d.waitFor();
  const dt = await d.innerText();
  ok(dt.includes('Soundcore Q30') && dt.includes('Trust') && dt.includes('Payment protection'), 'detail sheet shows product + trust breakdown');
  await p.screenshot({ path: `${OUT}/19-detail.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  // compare
  const picks = p.getByTestId('compare-pick');
  await picks.nth(0).check();
  await picks.nth(1).check();
  await p.getByTestId('compare-open').click();
  const ct = await p.getByTestId('compare-table').innerText();
  ok(/Total/.test(ct) && /Trust/.test(ct) && /Soundcore/.test(ct) && /JBL|Soundcore Q30 headphones/.test(ct), 'compare table');
  await p.screenshot({ path: `${OUT}/20-compare.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  // no follow-up chips under answers (each tap cost an AI credit); the user types the next question
  ok((await p.getByTestId('follow-ups').count()) === 0, 'no follow-up chips');
  await p.getByRole('textbox').first().fill('Show me cheaper options for this');
  await p.keyboard.press('Enter');
  await p.getByText('Show me cheaper options for this').waitFor({ timeout: 10000 });
  ok(true, 'a typed follow-up sends the question');
  await p.getByText('Twin result').nth(1).waitFor({ timeout: 30000 });
  // offline
  await ctx.setOffline(true);
  await p.getByTestId('offline').waitFor({ timeout: 5000 });
  ok(true, 'offline banner');
  await ctx.setOffline(false);
  await p.waitForTimeout(500);
  ok((await p.getByTestId('offline').count()) === 0, 'banner hides when back online');
  // retry after an error
  await p.locator('textarea').fill('FAILME');
  await p.keyboard.press('Enter');
  await p.getByTestId('retry').waitFor({ timeout: 30000 });
  ok(true, 'error shows Try again');
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
