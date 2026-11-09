// New shop UI (no AI): home, search + filters, back button, detail, stores, store page, services, Ask Dalil.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
(async () => {
  await fetch(BASE + '/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' }, geolocation: { latitude: 30.05, longitude: 31.24 }, permissions: ['geolocation'] });
  await ctx.route(/cdn\.salla\.example|pcmsuper\.art|imagekit/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let aiCalls = 0;
  p.on('request', (r) => r.url().includes('/api/chat') && aiCalls++);

  // 1) Guest → home
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.getByTestId('browse-guest').click();
  await p.getByTestId('home').waitFor();
  ok(await p.getByTestId('bottom-nav').isVisible(), 'bottom navigation');
  ok((await p.getByTestId('categories').locator('button').count()) === 8, 'categories row');
  await p.getByTestId('home-deals').getByTestId('tile').first().waitFor({ timeout: 10000 });
  const deal = await p.getByTestId('home-deals').getByTestId('tile').first().innerText();
  ok(/↓10%/.test(deal) && /770\.6/.test(deal), `today's deal from a real "was" price: ${deal.replace(/\n/g, ' ')}`);
  await p.getByTestId('home-stores').locator('button').first().waitFor();
  ok((await p.getByTestId('home-stores').locator('button').count()) === 4, 'Pi stores tiles');
  ok((await p.getByTestId('home-stores').locator('img[src^="/stores/"]').count()) === 4, 'stores show their own logos');
  await p.screenshot({ path: `${OUT}/50-home.png` });

  // 2) Search (no AI)
  await p.getByTestId('shop-search').fill('سماعة');
  await p.keyboard.press('Enter');
  await p.getByTestId('results').getByTestId('tile').first().waitFor();
  ok(p.url().includes('v=search') && decodeURIComponent(p.url()).includes('سماعة'), `search is in the URL: ${decodeURIComponent(p.url())}`);
  let tiles = await p.getByTestId('results').getByTestId('tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-store') + ' | ' + e.innerText.replace(/\n/g, ' ')));
  ok(tiles.length === 4 && tiles.some((x) => /Salla Shop Mall/.test(x)) && tiles.some((x) => /Pi Chain Mall/.test(x)) && tiles.some((x) => /^Piketplace/.test(x) && /312\.5/.test(x)), `results from 3 stores, Piketplace price incl. its 12.5 π shipping: ${tiles.join(' || ')}`);
  ok(!tiles.some((x) => /Lagos/.test(x)), 'Piketplace listing that only ships in Nigeria not shown');
  ok(!tiles.some((x) => /India/.test(x)), 'India-only listing not shown');
  ok(/4 results · 3 stores/.test(await p.getByTestId('result-meta').innerText()), `meta: ${await p.getByTestId('result-meta').innerText()}`);
  // price filter
  await p.getByTestId('f-price').click();
  await p.getByTestId('price-max').fill('200');
  await p.getByTestId('price-apply').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=results] [data-testid=tile]').length === 1, null, { timeout: 8000 });
  tiles = await p.getByTestId('results').getByTestId('tile').allInnerTexts();
  ok(/Bluetooth Headphones Pro/.test(tiles[0]), 'price ≤ 200 → only the 150 π headphones');
  await p.getByTestId('f-price').click();
  await p.getByRole('button', { name: 'Clear' }).last().click();
  // sort cheapest
  await p.getByTestId('f-sort').click();
  await p.getByTestId('sort-cheapest').click();
  await p.waitForTimeout(800);
  tiles = await p.getByTestId('results').getByTestId('tile').allInnerTexts();
  ok(tiles.length === 4 && /150/.test(tiles[0]) && /312\.5/.test(tiles[1]) && /700/.test(tiles[2]) && /770/.test(tiles[3]), 'sort: cheapest first');
  // store filter
  await p.getByTestId('f-store').click();
  await p.getByTestId('store-options').getByText('Salla Shop Mall').click();
  await p.waitForTimeout(800);
  tiles = await p.getByTestId('results').getByTestId('tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-store')));
  ok(tiles.length === 1 && tiles[0] === 'Salla Shop Mall', 'store filter');
  await p.screenshot({ path: `${OUT}/51-search.png` });
  ok(aiCalls === 0, 'no AI call for any of this');

  // 3) Detail as guest → Order asks to sign in
  await p.getByTestId('results').getByTestId('tile').first().click();
  const det = p.getByTestId('offer-detail');
  await det.waitFor();
  ok(/770\.6/.test(await det.innerText()), 'product detail opens');
  ok(!/Shipping\s*—/.test(await det.innerText()), 'no empty shipping box');
  await det.getByRole('button', { name: /^Order/ }).click();
  await p.getByText('Dev sign-in (local only)').waitFor({ timeout: 5000 });
  ok(true, 'ordering as a guest asks to sign in');
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByTestId('product-view').waitFor();
  ok(true, 'after sign-in you are back on the same product page');

  // 4) Back button: product → search → home
  await p.goBack();
  await p.getByTestId('search-view').waitFor({ timeout: 5000 });
  await p.goBack();
  await p.getByTestId('home').waitFor({ timeout: 5000 });
  ok(true, 'browser Back walks product → search → home');

  // 5) Stores directory + store page
  await p.getByTestId('nav-stores').click();
  await p.getByTestId('store-card').first().waitFor();
  const cards = await p.getByTestId('store-card').allInnerTexts();
  ok(cards.length >= 5 && cards.some((c) => /Salla Shop Mall[\s\S]*2 products/.test(c)), `stores with live counts (${cards.length})`);
  ok(!cards.some((c) => /Servara|Hũ Pi/.test(c)), 'country-only stores hidden in Egypt');
  await p.getByTestId('tab-partners').click();
  ok(/No official partners yet/.test(await p.getByTestId('store-list').innerText()), 'partners tab is honest (none yet)');
  await p.getByTestId('tab-all').click();
  await p.getByTestId('store-card').filter({ hasText: 'Salla Shop Mall' }).click();
  await p.getByTestId('store-results').getByTestId('tile').first().waitFor();
  ok((await p.getByTestId('store-results').getByTestId('tile').count()) === 2, 'store page lists its products');
  await p.getByTestId('store-search').fill('honey');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=store-results] [data-testid=tile]').length === 1, null, { timeout: 8000 });
  ok(true, 'search inside a store');
  await p.screenshot({ path: `${OUT}/52-store.png` });

  // 6) Services + near me
  await p.getByTestId('nav-services').click();
  await p.getByTestId('service-tiles').waitFor();
  await p.getByTestId('use-location').click();
  await p.locator('[data-shop-card]').first().waitFor({ timeout: 20000 });
  const near = await p.locator('[data-shop-card]').first().innerText();
  ok(/Downtown PlayStation/.test(near) && /m\b|km/.test(near), `nearest shop first: ${near.split('\n').slice(0, 2).join(' ')}`);
  await p.screenshot({ path: `${OUT}/53-services.png` });

  // 7) Deep link + Ask Dalil
  await p.goto(BASE + '/?v=search&q=honey', { waitUntil: 'networkidle' });
  await p.getByTestId('results').getByTestId('tile').first().waitFor();
  ok(/honey/i.test(await p.getByTestId('results').innerText()), 'deep link opens the search');
  await p.getByTestId('ask-fab').click();
  await p.getByRole('textbox', { name: 'What do you want to buy with Pi?' }).waitFor();
  ok(p.url().includes('v=ask') && !(await p.getByTestId('bottom-nav').isVisible().catch(() => false)), 'Ask Dalil = the AI chat (own screen)');
  await p.getByTestId('go-home').click();
  await p.getByTestId('home').waitFor();
  ok(true, 'home button from the chat');

  // 8) Arabic
  await p.getByRole('button', { name: 'Language' }).click();
  await p.waitForTimeout(400);
  ok((await p.getAttribute('html', 'dir')) === 'rtl' && /الرئيسية/.test(await p.getByTestId('bottom-nav').innerText()), 'Arabic RTL navigation');
  await p.screenshot({ path: `${OUT}/54-home-ar.png` });
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
