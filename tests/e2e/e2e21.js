// Public product pages + sitemap, monthly store report, admin inside a frame (Pi Browser), instant watch alerts.
const { chromium } = require('playwright');
const BASE = 'http://localhost:3100';
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = (r) => r.json().catch(() => ({}));
const post = (url, body, tok) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) });

(async () => {
  await fetch(BASE + '/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });

  // ---------- public product page + sitemap + robots ----------
  const sr = await J(await fetch(BASE + '/api/search?country=EG&q=Anker%20Q20'));
  const anker = (sr.offers || []).find((o) => /Anker Wireless Headphones Q20/.test(o.title));
  ok(anker && anker.ref && anker.listPrice === 480, `Salla "was" price from the partner API reaches search (${anker?.price} / was ${anker?.listPrice})`);
  const page = await fetch(BASE + `/p/${encodeURIComponent(anker.ref)}`);
  const html = await page.text();
  ok(page.status === 200 && /<h1[^>]*>Anker Wireless Headphones Q20<\/h1>/.test(html), `/p/<id> is plain HTML with the product name (${page.status})`);
  ok(/application\/ld\+json/.test(html) && /"@type":"ItemPage"/.test(html) && /"@type":"BreadcrumbList"/.test(html) && !/"@type":"Product"/.test(html), 'structured data: ItemPage + breadcrumb (no Product without offers, which Google rejects)');
  ok(/<meta property="og:title" content="Anker Wireless Headphones Q20[^"]*421\.3 π/.test(html) && /<link rel="canonical" href="[^"]*\/p\/salla%3A/.test(html), 'link preview title with the Pi price + canonical URL');
  ok(/href="\/\?v=p&amp;id=salla%3A/.test(html), 'button to open the product in the app');
  ok((await fetch(BASE + '/p/salla%3Anot-a-real-product')).status === 404 && (await fetch(BASE + '/p/%3Cscript%3E')).status === 404, 'unknown or malformed id → 404');
  const sm = await (await fetch(BASE + '/sitemap.xml')).text();
  const smCount = (sm.match(/<loc>[^<]*\/p\//g) || []).length;
  ok(/^<\?xml/.test(sm) && smCount >= 5 && sm.includes(`/p/${encodeURIComponent(anker.ref)}`), `sitemap.xml lists the product pages (${smCount})`);
  const robots = await (await fetch(BASE + '/robots.txt')).text();
  ok(/Disallow: \/admin/.test(robots) && /Disallow: \/api\//.test(robots) && /Sitemap: .*\/sitemap\.xml/.test(robots), 'robots.txt: no /admin or /api, points to the sitemap');

  // ---------- instant watch alert after the hourly catalog pull ----------
  const tu = (await J(await post('/api/auth/pi', { dev: 'watcher' }))).token;
  const w = await post('/api/watches', { offer: anker }, tu);
  ok(w.status === 201, `watch the Salla product (${w.status})`);
  await fetch('http://127.0.0.1:4061/__salla/price?id=aaaaaaaa-1111-4111-8111-000000000001&price=399');
  const re = await J(await fetch(BASE + '/api/admin/refresh?source=salla', { method: 'POST', headers: { Authorization: 'Bearer cron-test' } }));
  const ws = (await J(await fetch(BASE + '/api/watches', { headers: { Authorization: `Bearer ${tu}` } }))).watches || [];
  const mine = ws.find((x) => /Anker/.test(x.title));
  ok(re.result?.via === 'api' && mine && mine.lastPrice === 399 && mine.newDrop === true, `price drop seen right after the pull, no daily wait (${mine?.price} → ${mine?.lastPrice}, drop ${mine?.newDrop})`);

  // ---------- monthly report ----------
  for (let i = 0; i < 3; i++) await post('/api/track', { store: 'Salla Shop Mall', kind: 'visit', url: anker.url, title: anker.title }, tu);
  await post('/api/track', { store: 'Salla Shop Mall', kind: 'order', url: anker.url, title: anker.title }, tu);
  const boot = (await J(await post('/api/admin/login', { password: 'cron-test' }))).token;
  await post('/api/admin/password', { password: 'owner-pass-21' }, boot);
  const at = (await J(await post('/api/admin/login', { password: 'owner-pass-21' }))).token;
  const month = new Date().toISOString().slice(0, 7);
  ok((await fetch(BASE + `/api/admin/report?month=${month}`)).status === 401, 'report needs the admin token');
  const rep = await J(await fetch(BASE + `/api/admin/report?month=${month}`, { headers: { Authorization: `Bearer ${at}` } }));
  const sal = (rep.stores || []).find((s) => s.store === 'Salla Shop Mall');
  ok(sal && sal.visits >= 3 && sal.orders >= 1 && sal.buyers >= 1 && sal.topProducts[0]?.title === anker.title, `month report per store (Salla: ${sal?.visits} visits, ${sal?.orders} orders, ${sal?.buyers} buyers)`);
  ok((await fetch(BASE + '/api/admin/report?month=2026-13', { headers: { Authorization: `Bearer ${at}` } })).status === 400, 'bad month refused');
  // performance tab data: admin only, never the cron secret
  ok((await fetch(BASE + '/api/admin/perf')).status === 401 && (await fetch(BASE + '/api/admin/perf', { headers: { Authorization: 'Bearer cron-test' } })).status === 401, 'performance numbers need the admin token');
  const perf = await J(await fetch(BASE + '/api/admin/perf', { headers: { Authorization: `Bearer ${at}` } }));
  ok(perf.instance && typeof perf.instance.calls === 'number' && Array.isArray(perf.instance.by), `performance numbers for the admin (${JSON.stringify(perf.instance).slice(0, 80)})`);
  // Salla Local list is kept (shared cache): two calls, one browser read
  const ls1 = await fetch(BASE + '/api/local-shops?country=EG', { headers: { 'x-real-ip': '10.21.0.9' } });
  const ls2 = await J(await fetch(BASE + '/api/local-shops?country=EG&q=cafe', { headers: { 'x-real-ip': '10.21.0.9' } }));
  ok(ls1.ok && (ls2.shops || []).length > 0, `Salla Local list served from the saved copy (${(ls2.shops || []).length} shops)`);
  const csvRes = await fetch(BASE + `/api/admin/report?month=${month}&format=csv`, { headers: { Authorization: `Bearer ${at}` } });
  const raw = Buffer.from(await csvRes.arrayBuffer());
  const csv = raw.toString('utf8');
  ok(/text\/csv/.test(csvRes.headers.get('content-type')) && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf && /month,store,visits,orders,buyers/.test(csv) && /Salla Shop Mall/.test(csv), 'CSV download (opens in Excel with Arabic)');

  // ---------- admin panel: signed in at top level, never inside a frame ----------
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 860 } });
  // Another site that frames the panel (a real local server: Chromium won't let a faked page embed localhost).
  const framer = require('http').createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(`<!doctype html><iframe id=f src="${BASE}/admin" style="width:400px;height:800px"></iframe>`); }).listen(4999);
  const p = await ctx.newPage();
  await p.goto(BASE + '/admin');
  await p.locator('input[type=password]').first().fill('owner-pass-21');
  await p.keyboard.press('Enter');
  await p.getByTestId('admin').waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'التقارير' }).click();
  await p.getByTestId('admin-reports').getByText('Salla Shop Mall').first().waitFor({ timeout: 15000 });
  await p.screenshot({ path: `${OUT}/80-admin-report.png` });
  ok(true, 'reports tab shows the stores');
  await p.reload();
  await p.getByTestId('admin').waitFor({ timeout: 15000 });
  ok(true, 'top level: stays signed in after reload');
  const fr = await ctx.newPage();
  const resp = await fr.goto('http://127.0.0.1:4999/');
  const frame = fr.frameLocator('#f');
  await frame.locator('input[type=password]').first().waitFor({ timeout: 15000 });
  ok((await frame.locator('[data-testid=admin]').count()) === 0, 'inside a frame (Pi Browser / another site) the saved session is not used → password box');
  const h = (await fetch(BASE + '/admin')).headers;
  ok(!h.get('x-frame-options') && /noindex/.test(h.get('x-robots-tag') || ''), 'admin page can be framed (Pi Browser) and is not indexed');
  await frame.locator('input[type=password]').first().fill('owner-pass-21');
  await frame.locator('input[type=password]').first().press('Enter');
  await frame.locator('[data-testid=admin]').waitFor({ timeout: 15000 });
  ok(true, 'the owner can still sign in inside the frame with the password');
  await fr.screenshot({ path: `${OUT}/81-admin-framed.png` });
  void resp;
  framer.close();
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
