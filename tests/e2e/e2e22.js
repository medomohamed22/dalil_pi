// Salla partner API v2: ships_to + shipping per country, mall merchants, ?ref=dalilpi kept, and the
// Salla apps directory (/services): pull, ETag, validation, per-country API and the Services tab.
const { chromium } = require('playwright');
const BASE = 'http://localhost:3100';
const OUT = process.argv[2] || '.';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = async (r) => (await r).json().catch(() => ({}));
const cron = (q = 'force=1') => J(fetch(BASE + '/api/cron/catalog?' + q, { headers: { Authorization: 'Bearer cron-test' } }));
const log = async () => (await J(await fetch('http://127.0.0.1:4060/__log'))).filter((l) => l.startsWith('SALLA') && !l.includes('__salla'));
const search = (q) => J(fetch(BASE + '/api/search?' + q, { headers: { 'x-real-ip': '10.22.0.1' } }));
const svc = (q) => J(fetch(BASE + '/api/services?' + q, { headers: { 'x-real-ip': '10.22.0.2' } }));

(async () => {
  const r0 = await cron();
  const sres = (r0.results || []).find((r) => r.source === 'salla_services');
  ok(sres && sres.status === 'updated' && sres.items === 4, `apps directory pulled with the catalog (${JSON.stringify(sres)})`);
  const l0 = await log();
  ok(l0.some((l) => l.includes('/partner-catalog/services?page=1&limit=200') && l.includes('sig=ok')), 'GET /services signed like the catalog');

  // ---------- products: where they can be ordered ----------
  const eg = await search('country=EG&store=salla&limit=50');
  const sa = await search('country=SA&store=salla&limit=50');
  const vn = await search('country=VN&store=salla&limit=50');
  const t = (r) => (r.offers || []).map((o) => o.title);
  ok(t(sa).includes('Saudi Dates Box') && !t(eg).includes('Saudi Dates Box') && !t(vn).includes('Saudi Dates Box'), 'Saudi-only product (ships_to SA) shown only in Saudi Arabia');
  ok(t(eg).includes('Merchant Earbuds X1') && !t(sa).includes('Merchant Earbuds X1'), 'merchant product (ships_to EG) only in Egypt');
  ok(t(vn).includes('Soundcore Life headphones'), 'a product without ships_to still reaches every country');
  ok(!t(eg).some((x) => /evil/.test(x)), 'a link to another product id is dropped');
  const anker = (eg.offers || []).find((o) => /Anker/.test(o.title));
  ok(anker && anker.shipping === 0.8123 && Math.abs(anker.total - (anker.price + 0.8123)) < 0.02, `shipping from shipping_by_country in the total (${anker?.price} + ${anker?.shipping} = ${anker?.total})`);
  ok(anker && anker.url === 'https://mall.salla-shop.com/product/aaaaaaaa-1111-4111-8111-000000000001?ref=dalilpi', `link kept exactly with ?ref=dalilpi (${anker?.url})`);
  const mer = (eg.offers || []).find((o) => /Merchant Earbuds/.test(o.title));
  ok(mer && mer.store === 'Salla Shop Mall · Cairo Gadgets', `merchant shown as the seller (${mer?.store})`);
  ok(mer && mer.shipping == null && /checkout/i.test(mer.reason || ''), `null shipping → "Shipping at checkout" (${mer?.reason})`);
  ok(mer && /merchant-product\/aaaaaaaa-1111-4111-8111-000000000005\?ref=dalilpi$/.test(mer.url), 'merchant product link (merchant-product/<id>?ref=dalilpi)');
  const dates = (sa.offers || []).find((o) => /Dates/.test(o.title));
  ok(dates && dates.shipping === 0, 'free shipping (0) shown as free');
  const page = await (await fetch(BASE + '/p/' + encodeURIComponent('salla:aaaaaaaa-1111-4111-8111-000000000007'))).text();
  ok(/Saudi Dates Box/.test(page), 'public page of a Saudi-only product renders (shown for a country it ships to)');

  // ---------- apps directory API ----------
  const se = await svc('country=EG');
  const keys = (se.services || []).map((x) => x.key);
  ok(keys.length === 4 && se.types.restaurant === 1 && se.types.health === 1 && se.types.telegram === 1 && se.types.delivery === 1, `Egypt: restaurant, clinic/lab, delivery and Telegram (${keys.join(', ')})`);
  ok(!keys.some((k) => /evil/.test(k)), 'non-Salla link and unknown type dropped');
  ok((se.services || []).every((x) => /^https:\/\/([\w-]+\.)?salla-shop\.com\//.test(x.url) && x.url.endsWith('?ref=dalilpi')), 'every app link is a Salla link with ?ref=dalilpi kept');
  const sv = await svc('country=VN');
  ok((sv.services || []).length === 1 && sv.services[0].type === 'telegram', 'Vietnam: only the entries for every country (Telegram)');
  const sr = await svc('country=EG&type=restaurant');
  ok(sr.services?.length === 1 && sr.services[0].name === 'Kebab House' && sr.services[0].rating === 4.6, 'type filter');
  const sq = await svc('country=EG&q=' + encodeURIComponent('معمل'));
  ok(sq.services?.length === 1 && sq.services[0].price === 3.5 && sq.services[0].price_unit === 'visit', 'search by Arabic name; booking price per visit');
  ok((await fetch(BASE + '/api/services?country=EG&type=hack')).ok, 'unknown type is ignored, not an error');

  // ---------- ETag: nothing changed → 304 ----------
  const before = (await log()).length;
  await cron('force=1&source=salla');
  const l1 = (await log()).slice(before).filter((l) => l.includes('/services'));
  ok(l1.length === 1 && l1[0].includes('inm="s1"'), `re-pull sends the ETag (${l1.join(' | ')})`);
  ok(((await svc('country=EG')).services || []).length === 4, 'directory kept after a 304');
  await fetch('http://127.0.0.1:4061/__salla/services-version');
  const before2 = (await log()).length;
  const r2 = await cron('force=1&source=salla');
  const l2 = (await log()).slice(before2).filter((l) => l.includes('/services'));
  const s2 = (r2.results || []).find((r) => r.source === 'salla_services');
  ok(l2.length === 1 && s2?.status === 'updated' && s2.items === 4, `new version → 200 and a full read (${JSON.stringify(s2)})`);

  // ---------- Services tab ----------
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' } });
  await ctx.route(/cdn\.salla\.example/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE + '/?v=services', { waitUntil: 'networkidle' });
  await p.getByText('Browse without signing in').click({ timeout: 4000 }).catch(() => {});
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 4000 }).catch(() => {});
  const sec = p.getByTestId('salla-apps-section');
  await sec.waitFor({ timeout: 8000 }).catch(() => {});
  if (!(await sec.isVisible().catch(() => false))) await p.screenshot({ path: `${OUT}/60-salla-apps-fail.png` });
  ok(await sec.isVisible().catch(() => false), 'Services tab shows "In the Salla apps"');
  const cards = sec.locator('[data-salla-app]');
  ok((await cards.count()) === 4, `4 entries for Egypt (${await cards.count()})`);
  const kebab = sec.locator('[data-salla-app="restaurant:cb5eac39-0000-4000-8000-000000000001"]');
  ok((await kebab.getAttribute('href')) === 'https://mall.salla-shop.com/restaurants/r/cb5eac39-0000-4000-8000-000000000001?ref=dalilpi' && (await kebab.getAttribute('target')) === '_blank', 'restaurant opens its menu in the Salla app (ref kept)');
  const lab = await sec.locator('[data-salla-app="health:hh-1"]').innerText();
  ok(/3\.5 π/.test(lab) && /per visit/.test(lab), `clinic price per visit shown (${lab.replace(/\n/g, ' | ')})`);
  await p.getByTestId('app-type-telegram').click();
  await p.waitForTimeout(600);
  ok((await sec.locator('[data-salla-app]').count()) === 1 && /50 stars/.test(await sec.locator('[data-salla-app]').first().innerText()), 'type chip filters (Telegram Stars, 50 stars)');
  await p.screenshot({ path: `${OUT}/60-salla-apps.png` });
  ok(!errors.length, `no page errors (${errors.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
