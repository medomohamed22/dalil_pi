// Partner APIs: Map of Pi (local shops) + Salla partner API, and no time wasted browsing Pi apps.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const ask = async (p, text, waitText) => {
  const t0 = Date.now();
  await p.locator('textarea').fill(text);
  await p.keyboard.press('Enter');
  await p.getByText(waitText).first().waitFor({ timeout: 40000 });
  return (Date.now() - t0) / 1000;
};
(async () => {
  await fetch('http://localhost:3100/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });
  const cfg = await (await fetch('http://localhost:3100/api/config')).json();
  ok(cfg.partners.mapOfPi && cfg.partners.sallaApi, 'config reports both partner APIs on');
  const b = await chromium.launch();
  // No GPS shared: Map of Pi falls back to the IP's approximate location (Vercel headers).
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG', 'x-vercel-ip-city': 'Cairo', 'x-vercel-ip-latitude': '30.0444', 'x-vercel-ip-longitude': '31.2357' } });
  await ctx.route(/image\.pcmsuper\.art/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();

  // 1) Map of Pi
  const secs = await ask(p, 'MOP coffee near me', 'Coffee near you');
  ok(secs < 10, `local search answered in ${secs.toFixed(1)} s`);
  const prompts = await (await fetch('http://127.0.0.1:4020/__prompts')).json();
  ok(prompts.at(-1).includes('Call the map_of_pi tool FIRST'), 'prompt points the agent to map_of_pi');
  ok(!prompts.at(-1).includes('30.0444'), 'IP location is NOT sent to the model');
  ok((await p.getByText(/Coffee near you \(ip/).count()) === 1, 'tool says the location came from the IP');
  const cards = p.locator('[data-offer-card]');
  const stores = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-store')));
  ok(stores.join() === 'Pi Beans Cafe,Nile Pi Coffee' || stores.join() === 'Nile Pi Coffee,Pi Beans Cafe', `real shops only, test/restricted skipped: ${stores}`);
  const cafe = p.locator('[data-offer-card][data-store="Pi Beans Cafe"]');
  const ct = await cafe.innerText();
  ok(ct.includes('Latte coffee') && ct.includes('1.5') && ct.includes('9 Talaat Harb St') && ct.includes('4.7'), 'item, Pi price, address and rating from Map of Pi');
  ok(!ct.includes('Price not confirmed'), 'Map of Pi prices count as confirmed');
  ok((await cafe.getByRole('link', { name: 'Directions' }).getAttribute('href')).includes('30.046%2C31.24'), 'directions to the exact Map of Pi pin');
  const trust = Number(await cafe.getByTestId('trust').innerText());
  ok(trust >= 60, `Map of Pi shop is trusted (${trust})`);
  await cafe.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/16-mapofpi.png` });
  const log = await (await fetch('http://127.0.0.1:4060/__log')).json();
  const fetchCall = log.find((l) => l.startsWith('POST /api/v1/sellers/fetch'));
  ok(fetchCall && fetchCall.includes('Bearer mop-test-key') && fetchCall.includes('"search_query":"coffee"'), 'Map of Pi called with key + query');

  // 2) Salla partner API (no browser)
  const s2 = await ask(p, 'SALLA headphones', 'Best pick from Salla Shop');
  ok(s2 < 10, `Salla search answered in ${s2.toFixed(1)} s`);
  const sc = await p.locator('[data-offer-card]').evaluateAll((els) => els.map((e) => e.innerText));
  ok(sc.some((t) => t.includes('Anker Wireless Headphones Q20') && t.includes('420.5')), 'Salla products from the partner catalog (Pi price as sent)');
  ok(!sc.some((t) => t.includes('evil')), 'unsafe / non-Salla partner links dropped');
  const sallaLog = async () => (await (await fetch('http://127.0.0.1:4060/__log')).json()).filter((l) => l.startsWith('SALLA') && !l.includes('__salla'));
  const all1 = await sallaLog();
  const slog = all1.filter((l) => l.includes('/catalog'));
  ok(all1.length >= 2 && all1.every((l) => l.includes('sig=ok') && l.includes('auth=none') && /GET \/functions\/v1\/partner-catalog\/(catalog|services)\?page=1&limit=200/.test(l)), `every Salla call signed (HMAC), no key sent, only /catalog and /services (${all1.length} calls)`);
  // Hourly re-read with the ETag → 304, nothing re-downloaded; a new version → full read again.
  const before = slog.length;
  const re1 = await (await fetch('http://localhost:3100/api/admin/refresh?source=salla', { method: 'POST', headers: { Authorization: 'Bearer cron-test' } })).json();
  const slog2 = (await sallaLog()).filter((l) => l.includes('/catalog')).slice(before);
  ok(slog2.length === 1 && slog2[0].includes('inm="v1"') && slog2[0].includes('sig=ok'), `re-read sends the ETag → 304, one call (${slog2.join(' | ')}) ${JSON.stringify(re1).slice(0, 120)}`);
  await fetch('http://127.0.0.1:4061/__salla/version');
  await fetch('http://localhost:3100/api/admin/refresh?source=salla', { method: 'POST', headers: { Authorization: 'Bearer cron-test' } });
  const slog3 = (await sallaLog()).filter((l) => l.includes('/catalog')).slice(before + 1);
  const sr = await (await fetch('http://localhost:3100/api/search?country=EG&q=Anker%20Q20')).json();
  ok(slog3.length >= 1 && slog3.every((l) => l.includes('sig=ok')) && (sr.offers || []).some((o) => o.price === 420.5 && o.listPrice === 480), `new catalog version → full read; search shows 420.5 PI (was 480) (${slog3.join(' | ')})`);
  const fx = await (await fetch('http://localhost:3100/api/search?country=EG&q=evil')).json();
  ok(!(fx.offers || []).length, 'unsafe links never enter the index');

  // 2b) Pi Chain Mall first
  const s4 = await ask(p, 'PCM shoes', 'Pi Chain Mall first');
  ok(s4 < 10, `Pi Chain Mall search answered in ${s4.toFixed(1)} s`);
  const pc = (await p.locator('[data-offer-card]').evaluateAll((els) => els.map((e) => e.innerText))).slice(-2);
  ok(pc.length === 2 && /Pi Chain Mall/.test(pc[0]) && pc[0].includes('258'), `Pi Chain Mall listed first: ${pc.map((x) => x.split('\n')[0]).join(' | ')}`);
  ok(!pc.some((t) => /Hidden Shoes|Free Shoes/.test(t)), 'hidden/free listings skipped');
  ok(!pc.some((t) => /India Only Shoes/.test(t)), 'India-only listing not shown to a user in Egypt (live search)');
  ok(!pc[0].includes('Price not confirmed'), 'Pi Chain Mall price counts as confirmed');
  const plog = (await (await fetch('http://127.0.0.1:4060/__log')).json()).filter((l) => l.startsWith('PCM'));
  ok(plog.some((l) => l.includes('search=Shoes')), `lowercase query also tried as "Shoes" (${plog.length} calls)`);
  const pcmCard = p.locator('[data-offer-card]').nth((await p.locator('[data-offer-card]').count()) - 2);
  const pcmImg = await pcmCard.locator('img').first().getAttribute('src').catch(() => '');
  ok(pcmImg === 'https://image.pcmsuper.art/image/2026/2/9/shoe.webp', `product image: ${pcmImg}`);
  await pcmCard.getByTestId('open-detail').click();
  const det = p.getByTestId('offer-detail');
  await det.waitFor();
  await ctx.route(/pipcm\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>pcm</h1>' }));
  const [pcmTab] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), det.getByRole('button', { name: /^Order/ }).click()]);
  ok(pcmTab.url() === 'https://pipcm.com/#/product/new-detail?id=aaa111&userId=u1', `Order opens the exact Pi Chain Mall product: ${pcmTab.url()}`);
  await pcmTab.close();
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).click().catch(() => {});
  const s5 = await ask(p, 'PCMBROWSE', 'PCMRESULT');
  const r5 = await p.getByText('PCMRESULT').first().innerText();
  ok(/search_pi_chain_mall/.test(r5) && s5 < 6, 'browsing pipcm.com refused → points to the tool');

  // 2c) Salla Local shops (pay in Pi at the counter)
  const s6 = await ask(p, 'SLOCAL cafe near me', 'SLRESULT');
  const shopsBox = p.getByTestId('local-shops').last();
  const shopCards = await shopsBox.locator('[data-shop-card]').evaluateAll((els) => els.map((e) => e.innerText));
  ok(s6 < 20, `Salla Local answered in ${s6.toFixed(1)} s`);
  ok(shopCards.length === 1 && /Downtown PlayStation & Cafe/.test(shopCards[0]), `"كافيه" matches the cafe only: ${shopCards.map((x) => x.split('\n')[0]).join(' | ')}`);
  const dist = await shopsBox.getByTestId('shop-distance').first().innerText();
  ok(/^\d{3} m$/.test(dist), `distance from the user: ${dist}`);
  const cafeCard = shopsBox.locator('[data-shop-card]').first();
  const hrefsL = await cafeCard.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  ok(hrefsL.includes('https://mall.salla-shop.com/local/pay/22222222-2222-4222-8222-222222222222'), 'Pay the shop → Salla Local pay page');
  ok(hrefsL.some((h) => h.startsWith('https://wa.me/201000000002?text=')), 'WhatsApp with the shop number');
  ok(hrefsL.includes('tel:+201002223333'), 'call button');
  ok(hrefsL.some((h) => h.includes('destination=30.05%2C31.24')), 'directions to the exact pin');
  ok(/matched/.test(await p.getByText(/^SLRESULT/).last().innerText()), 'agent told the shops matched');
  await ask(p, 'SLOCAL pizza', 'SLRESULT nearest');
  const all = await p.getByTestId('local-shops').last().locator('[data-shop-card]').evaluateAll((els) => els.map((e) => e.querySelector('[dir=auto]').textContent.trim()));
  ok(all.join() === 'Downtown PlayStation & Cafe,Far Natural Shop', `no match → nearest Egyptian shops, closed/foreign/bad skipped: ${all}`);
  const sllog = (await (await fetch('http://127.0.0.1:4060/__log')).json()).filter((l) => l.startsWith('SLOCAL'));
  ok(sllog.length === 1, `shop list read once and cached (${sllog.length})`);
  await p.screenshot({ path: `${OUT}/40-salla-local.png` });

  // 2d) Smaller Pi marketplaces (Global Trade Pi)
  await ask(p, 'GTP router', 'GTP done.');
  const g = await p.locator('[data-offer-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-store') + ' | ' + e.innerText.replace(/\n/g, ' ')));
  const gl = g.filter((x) => x.startsWith('Global Trade Pi'));
  ok(gl.some((x) => /Cairo router/.test(x)) && gl.some((x) => /e-book/.test(x)), `Egypt item + digital item shown: ${gl.length}`);
  ok(!gl.some((x) => /MTN 5G ROUTER|auction|bad id/.test(x)), 'Nigeria-only physical item, auctions and bad ids skipped');
  const glog = (await (await fetch('http://127.0.0.1:4060/__log')).json()).filter((l) => l.startsWith('GTP'));
  ok(glog.some((l) => l.includes('search=router')), 'Global Trade Pi searched');
  const s7 = await ask(p, 'GTPSKIP', 'SKIPRESULT');
  ok(/skipped/.test(await p.getByText(/^SKIPRESULT/).last().innerText()) && s7 < 6, 'dead / non-Pi marketplace refused instantly');

  // 3) No browsing Map of Pi / pinet apps
  const s3 = await ask(p, 'MOPBROWSE', 'RESULT');
  const r = await p.getByText('RESULT').first().innerText();
  ok(/interactive Pi app/.test(r) && s3 < 6, `browsing mapofpi.com refused instantly (${s3.toFixed(1)} s)`);
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
