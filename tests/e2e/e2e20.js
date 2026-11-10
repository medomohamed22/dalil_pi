// Security / abuse: AI credit races and aborts, admin auth, token confusion, SSRF, floods, per-country home.
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = (r) => r.json().catch(() => ({}));
const post = (url, body, tok, headers = {}) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...headers }, body: JSON.stringify(body) });
const devLogin = async (name) => (await J(await post('/api/auth/pi', { dev: name }))).token;
const usage = async (tok) => (await J(await fetch(BASE + '/api/me', { headers: { Authorization: `Bearer ${tok}` } }))).usage ?? {};
const ask = (tok, signal) => fetch(BASE + '/api/chat', { method: 'POST', signal, headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ history: [{ role: 'user', text: 'headphones' }] }) });
const ip = (n) => ({ 'x-real-ip': `10.9.${Math.floor(n / 250)}.${n % 250}` });

(async () => {
  await fetch(BASE + '/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });

  // ---------- AI credit ----------
  ok((await ask('')).status === 401, 'AI without sign-in → 401');
  const forged = 'eyJkIjp7ImsiOiJzZXNzaW9uIiwidWlkIjoiaGFja2VyIn0sImV4cCI6OTk5OTk5OTk5OTk5OX0.AAAA';
  ok((await ask(forged)).status === 401, 'forged session token → 401');
  const t1 = await devLogin('racer');
  const u0 = await usage(t1);
  ok(u0.searchLimit === 1 && u0.searchesUsed === 0, `test user has exactly 1 AI credit (${u0.searchesUsed}/${u0.searchLimit})`);
  const par = await Promise.all(Array.from({ length: 8 }, () => ask(t1)));
  const codes = par.map((r) => r.status);
  await Promise.all(par.map((r) => r.text().catch(() => '')));
  ok(codes.filter((c) => c === 200).length === 1, `8 parallel questions with 1 credit → only 1 runs (${codes.join(',')})`);
  const u1 = await usage(t1);
  ok(u1.searchesUsed === 1, `credit spent once, not overspent (${u1.searchesUsed}/${u1.searchLimit})`);
  ok((await ask(t1)).status === 402, 'no credit left → 402');

  const t2 = await devLogin('aborter');
  const ctrl = new AbortController();
  const r2 = await ask(t2, ctrl.signal);
  ok(r2.status === 200, 'question started');
  ctrl.abort();
  await new Promise((r) => setTimeout(r, 1500));
  const u2 = await usage(t2);
  ok(u2.searchesUsed === 1, `closing the connection mid-answer still uses the credit (${u2.searchesUsed}/${u2.searchLimit})`);
  ok((await ask(t2)).status === 402, '…so a second "free" question is refused');

  const big = await post('/api/chat', { history: Array.from({ length: 61 }, () => ({ role: 'user', text: 'x' })) }, t2);
  ok(big.status === 400, `oversized history refused (${big.status})`);

  // ---------- admin ----------
  ok((await fetch(BASE + '/api/admin/overview')).status === 401, 'admin API without token → 401');
  ok((await fetch(BASE + '/api/admin/overview', { headers: { Authorization: `Bearer ${t1}` } })).status === 401, 'a user session token is not an admin token');
  ok((await fetch(BASE + '/api/admin/settings', { headers: { Authorization: 'Bearer cron-test' } })).status === 401, 'CRON_SECRET as bearer can NOT read/change settings');
  ok((await post('/api/admin/password', { password: 'hijacked-pass' }, 'cron-test')).status === 401, 'CRON_SECRET as bearer can NOT set the password');
  ok((await fetch(BASE + '/api/admin/refresh?source=gtp', { method: 'POST', headers: { Authorization: 'Bearer cron-test' } })).status === 200, 'CRON_SECRET still works for store refresh scripts');

  const boot = await J(await post('/api/admin/login', { password: 'cron-test' }, null, ip(1)));
  ok(boot.setup === true && boot.token, 'first login with CRON_SECRET → setup token');
  ok((await post('/api/admin/password', { password: 'owner-pass-1' }, boot.token)).status === 200, 'owner picks a password');
  ok((await fetch(BASE + '/api/admin/overview', { headers: { Authorization: `Bearer ${boot.token}` } })).status === 401, 'setup token dies once the password is set');
  ok((await post('/api/admin/login', { password: 'cron-test' }, null, ip(2))).status === 401, 'CRON_SECRET no longer logs in');
  const a1 = (await J(await post('/api/admin/login', { password: 'owner-pass-1' }, null, ip(3)))).token;
  ok((await fetch(BASE + '/api/admin/overview', { headers: { Authorization: `Bearer ${a1}` } })).status === 200, 'login with the password works');
  ok((await post('/api/admin/password', { password: 'evil-pass-99' }, a1)).status === 403, 'changing the password needs the current one');
  ok((await post('/api/admin/password', { password: 'evil-pass-99', current: 'wrong-one' }, a1)).status === 403, '…and a wrong current password is refused');
  ok((await post('/api/admin/password', { password: 'owner-pass-2', current: 'owner-pass-1' }, a1)).status === 200, 'password changed with the current one');
  ok((await fetch(BASE + '/api/admin/overview', { headers: { Authorization: `Bearer ${a1}` } })).status === 401, 'old sessions are signed out by the change');
  const tamper = a1.replace(/^[^.]+/, Buffer.from(JSON.stringify({ d: { k: 'admin', pv: 'boot' }, exp: Date.now() + 1e9 })).toString('base64url'));
  ok((await fetch(BASE + '/api/admin/overview', { headers: { Authorization: `Bearer ${tamper}` } })).status === 401, 'edited admin token (bad signature) → 401');

  // brute force from one address: locked after 8 wrong passwords, even with the right one after
  const tries = [];
  for (let i = 0; i < 10; i++) tries.push((await post('/api/admin/login', { password: `guess-${i}` }, null, ip(50))).status);
  ok(tries.slice(0, 8).every((s) => s === 401) && tries.slice(8).every((s) => s === 429), `8 wrong passwords then locked (${tries.join(',')})`);
  ok((await post('/api/admin/login', { password: 'owner-pass-2' }, null, ip(50))).status === 429, 'locked address waits even with the right password');
  ok((await post('/api/admin/login', { password: 'owner-pass-2' }, null, ip(51))).status === 200, 'the owner from another address still gets in');

  // ---------- SSRF ----------
  for (const u of ['http://127.0.0.1:3100/api/admin/login', 'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:7f00:1]:3100/', 'http://2130706433:3100/', 'file:///etc/passwd']) {
    const r = await J(await fetch(BASE + '/api/preview?url=' + encodeURIComponent(u), { headers: ip(90) }));
    ok(!r.title && !r.description && !JSON.stringify(r).includes('passwordSet'), `preview refuses internal ${u}`);
  }

  // ---------- floods ----------
  const s = [];
  for (let i = 0; i < 100; i++) s.push(fetch(BASE + `/api/search?country=EG&q=zzflood${i}`, { headers: ip(100) }).then((r) => r.status));
  const st = await Promise.all(s);
  ok(st.filter((x) => x === 429).length >= 9 && st.filter((x) => x === 200).length <= 90, `search flood is cut at 90/min (${st.filter((x) => x === 429).length}×429)`);
  const tr = [];
  for (let i = 0; i < 35; i++) tr.push(post('/api/track', { store: 'X', kind: 'visit' }, null, ip(101)).then((r) => r.status));
  const ts = await Promise.all(tr);
  ok(ts.filter((x) => x === 429).length >= 5, `click flood is cut at 30/min (${ts.filter((x) => x === 429).length}×429)`);
  const stats = await J(await fetch(BASE + '/api/admin/stats?days=1', { headers: { Authorization: `Bearer ${(await J(await post('/api/admin/login', { password: 'owner-pass-2' }, null, ip(52)))).token}` } }));
  const flood = (stats.misses || []).filter((m) => /zzflood/.test(m.q)).length;
  ok(flood <= 20, `random-query flood records at most 20 missed searches (${flood})`);
  const sd = await Promise.all(Array.from({ length: 70 }, (_, i) => fetch(BASE + `/api/stores?country=EG&bust=${i}`, { headers: ip(102) }).then((r) => r.status)));
  ok(sd.filter((x) => x === 429).length >= 9, `stores cache-busting flood is cut (${sd.filter((x) => x === 429).length}×429)`);


  // ---------- reputation can't be inflated with self-reported "paid" orders ----------
  {
    const tr = await devLogin('reviewer');
    const sr = await J(await fetch(BASE + '/api/search?country=EG&q=headphones&limit=12', { headers: ip(120) }));
    const offer = (sr.offers || []).find((o) => o.sig && o.currency === 'PI' && o.url);
    ok(!!offer, `a signed offer to order (${offer?.store})`);
    const forged = await post('/api/orders', { offer: { ...offer, storeDomain: 'victim-store.example' } }, tr);
    ok(forged.status === 400, `changing the store domain breaks the signature (${forged.status})`);
    const mk = async () => (await J(await post('/api/orders', { offer }, tr))).order;
    const o1 = await mk();
    ok(o1 && o1.storeDomain === new URL(offer.url).hostname.replace(/^www\./, ''), `order's store = the signed link's host (${o1?.storeDomain})`);
    const pay = (id) => fetch(BASE + `/api/orders/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: `Bearer ${tr}` }, body: JSON.stringify({ status: 'paid' }) });
    await pay(o1.id);
    ok((await post('/api/reviews', { orderId: o1.id, rating: 1 }, tr)).status === 201, 'first review of the store accepted');
    const o2 = await mk();
    await pay(o2.id);
    const again = await post('/api/reviews', { orderId: o2.id, rating: 1 }, tr);
    ok(again.status >= 400 && again.status < 500, `second "paid" order can't add a second review of the same store (${again.status})`);
    ok((await post('/api/disputes', { orderId: o1.id, kind: 'scam' }, tr)).status === 201, 'one problem report accepted');
    const d2 = await post('/api/disputes', { orderId: o2.id, kind: 'scam' }, tr);
    ok(d2.status >= 400 && d2.status < 500, `second report on the same store refused (${d2.status})`);
    const o3 = await mk();
    const d3 = await post('/api/disputes', { orderId: o3.id, kind: 'scam' }, tr);
    ok(d3.status >= 400 && d3.status < 500, `a never-opened (draft) order can't be reported (${d3.status})`);
  }

  // ---------- oversized chat body refused before parsing ----------
  {
    const tb = await devLogin('bigbody');
    const huge = JSON.stringify({ history: [{ role: 'user', text: 'x', images: ['data:image/png;base64,' + 'A'.repeat(4_200_000)] }] });
    const r = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${tb}` }, body: huge });
    ok(r.status === 413, `4.2 MB chat request → 413 (${r.status})`);
    ok((await usage(tb)).searchesUsed === 0, 'no AI credit taken for it');
  }

  // ---------- every country gets products ----------
  for (const c of ['EG', 'NG', 'US']) {
    const all = await J(await fetch(BASE + `/api/search?country=${c}&limit=50`, { headers: ip(110) }));
    ok(all.offers?.length > 0, `${c}: products ready on the home page (${all.offers?.length}) from ${[...new Set((all.offers || []).map((o) => o.store))].join(', ')}`);
  }
  const sb = await J(await fetch(BASE + '/api/search?country=EG&store=salla&limit=24', { headers: ip(110) }));
  ok(sb.offers?.length > 0 && sb.offers.every((o) => o.store === 'Salla Shop Mall'), `browsing one store with no words lists that store (${sb.offers?.length} Salla products)`);
  const vn = await J(await fetch(BASE + '/api/search?country=VN&store=salla&cat=phones', { headers: ip(110) }));
  ok(vn.offers?.length === 0, 'Salla (ships to Egypt/Middle East/Africa) is not offered in Vietnam');
})().catch((e) => { console.error(e); process.exit(1); });
