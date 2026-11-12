// Hardening: bounded chat history, real photos only, a hard deadline with credit back,
// and product pages whose image file names have Arabic digits.
const BASE = 'http://localhost:3100';
const META = 'http://localhost:4020';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = (r) => r.json().catch(() => ({}));
const post = (url, body, tok) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'x-vercel-ip-country': 'EG' }, body: JSON.stringify(body) });
const usage = async (tok) => (await J(await fetch(BASE + '/api/me', { headers: { Authorization: `Bearer ${tok}` } }))).usage ?? {};
const events = async (r) => (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));

(async () => {
  await fetch(BASE + '/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });
  const tok = (await J(await post('/api/auth/pi', { dev: 'hardener' }))).token;

  // 1. A huge, invented history is cut before the model sees it.
  const big = [];
  for (let i = 0; i < 59; i++) big.push({ role: i % 2 ? 'assistant' : 'user', text: 'x'.repeat(20000) });
  big.push({ role: 'user', text: 'zqxv giant history question' });
  const r1 = await post('/api/chat', { history: big }, tok);
  await events(r1);
  const last = (await J(await fetch(META + '/__chat'))).last;
  ok(r1.status === 200 && last && last.turns <= 12 && last.chars <= 26000, `model got ${last?.turns} turns / ${last?.chars} chars (sent 60 turns / 1.2M chars)`);

  // 2. Only real photos.
  const bad = await post('/api/chat', { history: [{ role: 'user', text: 'what is this', images: ['https://evil.example/x.png'] }] }, tok);
  ok(bad.status === 400 && (await J(bad)).code === 'BAD_IMAGE', `a link posing as a photo is refused (${bad.status})`);
  const svg = await post('/api/chat', { history: [{ role: 'user', text: 'what is this', images: ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='] }] }, tok);
  ok(svg.status === 400, `an SVG "photo" is refused (${svg.status})`);
  const u0 = await usage(tok);
  ok(u0.searchesUsed === 1, `refused requests take no credit (${u0.searchesUsed} used)`);

  // 3. Hard deadline: the model hangs → the answer stops, the credit comes back.
  const t0 = Date.now();
  const ev = await events(await post('/api/chat', { history: [{ role: 'user', text: 'HANGFOREVER zqxv' }] }, tok));
  const err = ev.find((e) => e.type === 'error');
  ok(Date.now() - t0 < 12000 && err && /too long/i.test(err.message), `stopped after ${Date.now() - t0} ms: ${err?.message}`);
  const u1 = await usage(tok);
  ok(u1.searchesUsed === 1, `credit returned after the timeout (${u1.searchesUsed} used)`);

  // 4. Image file name with Arabic digits: product page renders, link is percent-encoded.
  const pg = await fetch(BASE + '/p/' + encodeURIComponent('pkt:505'));
  const html = await pg.text();
  ok(pg.status === 200 && html.includes('%D9%A2') && !/IMG_٢/.test(html), `product page with an Arabic image name: ${pg.status}`);
  const link = pg.headers.get('link') || '';
  ok(/^[\x20-\x7e]*$/.test(link), 'Link header is plain ASCII');
})().catch((e) => { console.log('FAIL crash ' + e.stack); process.exitCode = 1; });
