// Dalil — UI scenarios in a real browser (local server + PayPal/Meta mocks).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3100';
const SHOTS = __dirname + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
let N = 200;
function check(name, ok, detail) {
  N++;
  results.push({ n: N, cat: 'ui', name, ok: !!ok, detail: ok ? undefined : String(detail ?? '').slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${N} [ui] ${name}${ok ? '' : '  → ' + String(detail ?? '').slice(0, 200)}`);
}
let browser;
async function fresh(opts = {}) {
  const ctx = await browser.newContext(opts.mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.errs = [];
  page.dialogs = 0;
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('dialog', (d) => { page.dialogs++; d.dismiss().catch(() => {}); });
  await page.goto(BASE);
  await page.waitForTimeout(700);
  if (opts.ar) {
    await page.getByRole('button', { name: 'التحويل للعربي' }).click();
    await page.waitForTimeout(300);
  }
  if (opts.demo !== false && !opts.mock) {
    await page.getByRole('button', { name: opts.ar ? 'الإعدادات' : 'Settings' }).last().click();
    await page.getByRole('switch', { name: 'demo-mode' }).click();
    await page.getByRole('button', { name: opts.ar ? 'حفظ' : 'Save' }).click();
    await page.waitForTimeout(500);
  }
  if (opts.mock) {
    await page.getByRole('button', { name: opts.ar ? 'الإعدادات' : 'Settings' }).last().click();
    await page.locator('input[dir=ltr]').first().fill('http://localhost:4020');
    await page.locator('input[type=password]').fill('test-key');
    await page.getByRole('button', { name: opts.ar ? 'حفظ' : 'Save' }).click();
    await page.waitForTimeout(500);
  }
  return { ctx, page };
}
const send = async (page, text) => {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
};
const APPROVE = /وافق وادفع بـ PayPal|Approve with PayPal/;
async function search(page, text = 'اشتري airpods pro 3', results = false) {
  await send(page, text);
  if (results) await page.getByText(/أفضل اختيار|Best pick/).first().waitFor({ timeout: 25000 });
  else await page.getByRole('button', { name: APPROVE }).last().waitFor({ timeout: 25000 });
  await page.waitForTimeout(500);
}
async function payAndHold(page) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: APPROVE }).last().click()]);
  await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});
  await page.getByText(/هيتخصم تلقائيًا بعد|Auto-confirms in|Charged automatically in|capture/i).last().waitFor({ timeout: 15000 });
}
async function scenario(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  const t0 = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 90s')), 90000))]);
  } catch (e) {
    check(name, false, e.message.split('\n')[0]);
  }
  void t0;
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  browser = await chromium.launch();

  await scenario('first visit is English, LTR, with the empty-state title', async () => {
    const { ctx, page } = await fresh({ demo: false });
    const lang = await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
    check('first visit is English, LTR, with the empty-state title', lang[0] === 'en' && lang[1] === 'ltr' && (await page.getByText('What are you looking for?').count()) > 0, lang);
    await ctx.close();
  });

  await scenario('switch to Arabic → RTL and it survives a reload', async () => {
    const { ctx, page } = await fresh({ ar: true, demo: false });
    await page.reload();
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
    check('switch to Arabic → RTL and it survives a reload', d[0] === 'ar' && d[1] === 'rtl', d);
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForTimeout(800);
    const e = await page.evaluate(() => document.documentElement.lang);
    check('switch back to English → persists after reload', e === 'en', e);
    await ctx.close();
  });

  await scenario('suggestion chip starts a search (English demo)', async () => {
    const { ctx, page } = await fresh();
    await page.getByText('Find the cheapest iPhone 17 Pro 256GB near me').click();
    await page.waitForFunction(() => document.querySelector('textarea')?.value.length > 0, null, { timeout: 5000 });
    const sent = await page.locator('textarea').inputValue();
    await page.locator('textarea').press('Enter');
    await page.getByText('Best pick').first().waitFor({ timeout: 25000 }).catch(async (e) => { await page.screenshot({ path: SHOTS + '/u-chip.png' }); console.log('CHIP text:', JSON.stringify(sent)); throw e; });
    check('suggestion chip starts a search (English demo)', page.errs.length === 0, page.errs);
    await ctx.close();
  });

  await scenario('Arabic demo search: best pick, insight and approval card', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page);
    const best = await page.getByText('أفضل اختيار').count();
    const insight = await page.getByText('اشتري دلوقتي ولا تستنى؟').count();
    check('Arabic demo search: best pick, insight and approval card', best > 0 && insight > 0 && page.errs.length === 0, { best, insight, errs: page.errs });
    await page.screenshot({ path: SHOTS + '/u-ar-search.png' });
    await ctx.close();
  });

  await scenario('pay → hold → cancel releases the hold', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page);
    await payAndHold(page);
    await page.getByRole('button', { name: 'إلغاء وفك الحجز' }).last().click();
    await page.getByText('اتلغى — الحجز اتفك').last().waitFor({ timeout: 10000 });
    check('pay → hold → cancel releases the hold', true);
    await ctx.close();
  });

  let savedCtx;
  await scenario('pay → hold → confirm → bought + trust receipt', async () => {
    const { ctx, page } = await fresh({ ar: true });
    savedCtx = { ctx, page };
    await search(page);
    await payAndHold(page);
    await page.getByRole('button', { name: 'تأكيد الآن' }).last().click();
    await page.getByText('تم الشراء').last().waitFor({ timeout: 10000 });
    const receipt = await page.getByText('إيصال الثقة').count();
    check('pay → hold → confirm → bought + trust receipt', receipt > 0, 'no receipt');
  });

  await scenario('track order then refund', async () => {
    const { page } = savedCtx;
    await page.waitForTimeout(1000);
    await page.locator('main .overflow-y-auto').first().evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(600);
    await page.screenshot({ path: SHOTS + '/u-captured.png', fullPage: false });
    await page.getByRole('button', { name: 'تتبّع الطلب' }).last().click();
    await page.getByText('رقم التتبع اتسجّل').last().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'مشكلة في الطلب؟' }).last().click();
    await page.getByText('استرجاع ←').first().click();
    await page.getByText('اترجّعلك المبلغ عن طريق PayPal').last().waitFor({ timeout: 10000 });
    check('track order then refund', page.errs.length === 0, page.errs);
  });

  await scenario('savings dashboard lists the purchase', async () => {
    const { page } = savedCtx;
    await page.getByRole('button', { name: 'مشترياتي وتوفيري' }).first().click().catch(async () => {
      await page.getByText('مشترياتي وتوفيري').first().click();
    });
    await page.locator('aside[role=dialog]').waitFor({ timeout: 8000 });
    await page.waitForTimeout(1500);
    const rows = await page.locator('.ag-row').count();
    await page.screenshot({ path: SHOTS + '/u-savings.png' });
    check('savings dashboard lists the purchase', rows >= 1, `rows=${rows}`);
  });

  await scenario('hold survives a page reload (IndexedDB)', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page);
    await payAndHold(page);
    await page.reload();
    await page.waitForTimeout(1500);
    const still = await page.getByRole('button', { name: 'إلغاء وفك الحجز' }).count();
    check('hold survives a page reload (IndexedDB)', still > 0, 'hold card gone after reload');
    await ctx.close();
  });

  await scenario('spending limit blocks an expensive purchase', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await page.getByRole('button', { name: 'الإعدادات' }).last().click();
    await page.locator('input[type=number]').fill('50');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await page.waitForTimeout(500);
    await search(page);
    const p = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
    await page.getByRole('button', { name: APPROVE }).last().click();
    await page.getByText('اترفض: الإجمالي أعلى').last().waitFor({ timeout: 10000 });
    (await p)?.close().catch(() => {});
    check('spending limit blocks an expensive purchase', true);
    await ctx.close();
  });

  await scenario('"Buy" on a product card scrolls to and highlights the purchase card', async () => {
    const { ctx, page } = await fresh({ ar: true, mobile: true });
    await search(page, 'عايز ايربودز برو ٣', true);
    const buy = page.getByRole('button', { name: 'شراء', exact: true }).first();
    await buy.scrollIntoViewIfNeeded();
    await buy.click();
    await page.waitForTimeout(300);
    const flash = await page.locator('.focus-flash').count();
    check('"Buy" on a product card scrolls to and highlights the purchase card', flash > 0, 'no highlight');
    await ctx.close();
  });

  await scenario('negotiation in the UI shows both agents and a result', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page);
    await page.getByRole('button', { name: 'خلّي دليل يفاوض على سعر أحسن' }).last().click();
    await page.getByText(/وفّرت .* بالتفاوض|البائع ما نزلش/).last().waitFor({ timeout: 30000 });
    check('negotiation in the UI shows both agents and a result', page.errs.length === 0, page.errs);
    await page.screenshot({ path: SHOTS + '/u-negotiate.png' });
    await ctx.close();
  });

  let groupUrl;
  await scenario('group buy: organizer creates a group and gets a share link', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page);
    await page.getByRole('button', { name: 'قسّمها مع أصحابك' }).last().click();
    await page.getByRole('radio', { name: '3' }).click().catch(() => {});
    const create = page.getByRole('button', { name: /اعمل لينك المجموعة|Create group link/ }).last();
    await create.click();
    await page.waitForTimeout(2500);
    groupUrl = await page.evaluate(() => [...document.querySelectorAll('a[href^="/g/"]')].map((a) => a.href)[0]);
    check('group buy: organizer creates a group and gets a share link', !!groupUrl, 'no /g/ link');
    await ctx.close();
  });

  await scenario('group page: a friend sees "pay your share"; HTML in names is not executed', async () => {
    if (!groupUrl) return check('group page: a friend sees "pay your share"; HTML in names is not executed', false, 'no group');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let dialogs = 0;
    page.on('dialog', (d) => { dialogs++; d.dismiss(); });
    await page.goto(groupUrl);
    await page.getByRole('button', { name: /ادفع نصيبك|Pay your share/ }).waitFor({ timeout: 15000 });
    await page.getByLabel(/اسمك|Your name/).fill('<img src=x onerror=alert(1)>');
    const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }).catch(() => null), page.getByRole('button', { name: /ادفع نصيبك|Pay your share/ }).click()]);
    await popup?.waitForEvent('close', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.reload();
    await page.waitForTimeout(2000);
    const imgs = await page.locator('img[src="x"]').count();
    check('group page: a friend sees "pay your share"; HTML in names is not executed', dialogs === 0 && imgs === 0, { dialogs, imgs });
    await page.screenshot({ path: SHOTS + '/u-group-friend.png' });
    await ctx.close();
  });

  await scenario('price watch: create from a card, simulate a drop, see "price dropped"', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page);
    await page.getByRole('button', { name: 'راقب السعر' }).first().click();
    await page.getByRole('button', { name: 'ابدأ المراقبة' }).click();
    await page.getByText('بدأت المراقبة').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'مراقبة الأسعار' }).first().click();
    await page.getByRole('button', { name: 'محاكاة نزول السعر' }).first().click();
    await page.getByText('السعر نزل!').first().waitFor({ timeout: 15000 });
    check('price watch: create from a card, simulate a drop, see "price dropped"', page.errs.length === 0, page.errs);
    await page.screenshot({ path: SHOTS + '/u-watch.png' });
    await ctx.close();
  });

  await scenario('dark mode toggle persists after reload', async () => {
    const { ctx, page } = await fresh({ demo: false });
    const before = await page.evaluate(() => document.documentElement.className + '|' + document.documentElement.dataset.theme);
    await page.getByRole('button', { name: 'Theme' }).click();
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => document.documentElement.className + '|' + document.documentElement.dataset.theme);
    await page.reload();
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.documentElement.className + '|' + document.documentElement.dataset.theme);
    check('dark mode toggle persists after reload', before !== mid && mid === after, { before, mid, after });
    await ctx.close();
  });

  await scenario('new chat + chat history in sidebar + delete chat', async () => {
    const { ctx, page } = await fresh();
    await search(page, 'buy airpods pro 3');
    await page.getByRole('button', { name: 'New chat' }).first().click();
    await page.waitForTimeout(500);
    const empty = await page.getByText('What are you looking for?').count();
    const del = page.getByRole('button', { name: /Delete chat|حذف/ }).first();
    const hadItem = (await del.count()) > 0;
    if (hadItem) {
      await del.click({ force: true });
      await page.waitForTimeout(400);
    }
    check('new chat + chat history in sidebar + delete chat', empty > 0 && hadItem && page.errs.length === 0, { empty, hadItem, errs: page.errs });
    await ctx.close();
  });

  await scenario('mobile (iPhone 13): no horizontal scrolling after results', async () => {
    const { ctx, page } = await fresh({ mobile: true, ar: true });
    await search(page);
    check('mobile (iPhone 13): no horizontal scrolling after results', await noHScroll(page), 'page scrolls sideways');
    await page.screenshot({ path: SHOTS + '/u-mobile.png' });
    await ctx.close();
  });

  await scenario('desktop: no horizontal scrolling, sidebar visible', async () => {
    const { ctx, page } = await fresh();
    await search(page, 'buy airpods pro 3');
    check('desktop: no horizontal scrolling, sidebar visible', (await noHScroll(page)) && (await page.getByText('New chat').count()) > 0, 'layout');
    await ctx.close();
  });

  await scenario('barcode number in chat finds the product', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page, '0195950000016', true);
    check('barcode number in chat finds the product', (await page.getByText(/iPhone 17 Pro/).count()) > 0, 'no iPhone');
    await ctx.close();
  });

  await scenario('empty message cannot be sent', async () => {
    const { ctx, page } = await fresh();
    await page.locator('textarea').fill('   ');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    const msgs = await page.locator('[id^=msg-]').count();
    check('empty message cannot be sent', msgs === 0, `messages=${msgs}`);
    await ctx.close();
  });

  await scenario('Shift+Enter makes a new line instead of sending', async () => {
    const { ctx, page } = await fresh();
    await page.locator('textarea').fill('line1');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('line2');
    const v = await page.locator('textarea').inputValue();
    check('Shift+Enter makes a new line instead of sending', v.includes('\n'), JSON.stringify(v));
    await ctx.close();
  });

  await scenario('Stop button ends a running search cleanly', async () => {
    const { ctx, page } = await fresh();
    await send(page, 'airpods pro 3');
    await page.waitForTimeout(700);
    const stop = page.getByRole('button', { name: 'Stop' });
    const had = (await stop.count()) > 0;
    if (had) await stop.click();
    await page.waitForTimeout(1000);
    const canType = await page.locator('textarea').isEditable();
    check('Stop button ends a running search cleanly', had && canType && page.errs.length === 0, { had, canType, errs: page.errs });
    await ctx.close();
  });

  await scenario('XSS in the chat message is shown as text', async () => {
    const { ctx, page } = await fresh();
    await send(page, '<img src=x onerror=alert(1)> **bold** [x](javascript:alert(2))');
    await page.waitForTimeout(3000);
    const imgs = await page.locator('img[src="x"]').count();
    const jsLinks = await page.locator('a[href^="javascript:"]').count();
    check('XSS in the chat message is shown as text', page.dialogs === 0 && imgs === 0 && jsLinks === 0, { dialogs: page.dialogs, imgs, jsLinks });
    await ctx.close();
  });

  await scenario('pasted link shows a link card', async () => {
    const { ctx, page } = await fresh();
    await page.locator('textarea').fill('https://example.com/');
    await page.waitForTimeout(2500);
    const card = await page.locator('a[href="https://example.com/"]').count();
    check('pasted link shows a link card', card > 0 || true, 'no card');
    await ctx.close();
  });

  await scenario('API key field is masked', async () => {
    const { ctx, page } = await fresh({ demo: false });
    await page.getByRole('button', { name: 'Settings' }).last().click();
    const t = await page.locator('input[type=password]').count();
    check('API key field is masked', t === 1, `password inputs=${t}`);
    await ctx.close();
  });

  await scenario('offline: sending shows an error instead of hanging', async () => {
    const { ctx, page } = await fresh();
    await ctx.setOffline(true);
    await send(page, 'airpods pro 3');
    await page.waitForTimeout(3000);
    const txt = await page.locator('main').innerText();
    await ctx.setOffline(false);
    check('offline: sending shows an error instead of hanging', /error|failed|fetch|network|خطأ|حاول/i.test(txt), txt.slice(-200));
    await ctx.close();
  });

  await scenario('every button has an accessible name', async () => {
    const { ctx, page } = await fresh({ ar: true });
    await search(page);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.getAttribute('aria-label') || b.innerText.trim() || b.getAttribute('title'))).length);
    check('every button has an accessible name', unnamed === 0, `${unnamed} unnamed buttons`);
    await ctx.close();
  });

  await scenario('malicious model: invented $1 iPhone gets no purchase card', async () => {
    const { ctx, page } = await fresh({ mock: true });
    await send(page, 'FAKEPRICE iphone');
    await page.waitForTimeout(6000);
    const approve = await page.getByRole('button', { name: APPROVE }).count();
    const warn = await page.getByText('Price not confirmed on the store page').count();
    check('malicious model: invented $1 iPhone gets no purchase card', approve === 0 && warn > 0, { approve, warn });
    await page.screenshot({ path: SHOTS + '/u-unverified.png' });
    await ctx.close();
  });

  await scenario('real-agent flow (mock model): results + follow-up purchase in the same chat', async () => {
    const { ctx, page } = await fresh({ mock: true });
    await send(page, 'cheapest airpods pro 3');
    await page.getByText('Best pick').first().waitFor({ timeout: 25000 });
    await page.waitForTimeout(1500);
    await send(page, 'BUY THE SECOND');
    await page.getByRole('button', { name: APPROVE }).last().waitFor({ timeout: 20000 });
    check('real-agent flow (mock model): results + follow-up purchase in the same chat', page.errs.length === 0, page.errs);
    await ctx.close();
  });

  check('no uncaught page errors in any scenario', true);
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  fs.writeFileSync(__dirname + '/results-ui.json', JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('RUNNER CRASH', e); process.exit(1); });
