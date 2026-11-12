// Ask Dalil, index first: a plain product request already in Dalil Index is answered from the index
// (cards straight away, one AI call with no tools for the short recommendation); anything else
// still goes to the full agent.
const OUT = process.argv[2];
const BASE = 'http://localhost:3100';
const META = 'http://localhost:4020';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const J = (r) => r.json().catch(() => ({}));
const post = (url, body, tok) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'x-vercel-ip-country': 'EG' }, body: JSON.stringify(body) });
const chat = async () => J(await fetch(META + '/__chat'));
async function ask(tok, history, settings = {}) {
  const before = await chat();
  const t0 = Date.now();
  const r = await post('/api/chat', { history, settings: { lang: 'ar', country: 'EG', ...settings } }, tok);
  const lines = (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const after = await chat();
  const products = lines.filter((e) => e.type === 'block' && e.block.type === 'products').map((e) => e.block.offers);
  return {
    status: r.status,
    ms: Date.now() - t0,
    offers: products.at(-1) || [],
    text: lines.filter((e) => e.type === 'text').map((e) => e.delta).join(''),
    steps: lines.filter((e) => e.type === 'step').map((e) => e.step.tool),
    calls: after.calls - before.calls,
    withTools: after.withTools - before.withTools,
    noTools: after.noTools - before.noTools,
    idx: after.indexOnly - before.indexOnly,
  };
}

(async () => {
  await fetch(BASE + '/api/cron/catalog?force=1', { headers: { Authorization: 'Bearer cron-test' } });
  const tok = (await J(await post('/api/auth/pi', { dev: 'quicky' }))).token;

  // 1. Plain product request → AI searches ONLY Dalil Index (picks the keywords, keeps what fits).
  const a = await ask(tok, [{ role: 'user', text: 'INDEXFIRST headphones' }]);
  const t1 = (await chat()).lastTools;
  ok(a.status === 200 && a.offers.length >= 2, `index answer shows cards (${a.offers.length}: ${a.offers.map((o) => o.store).join(', ')})`);
  ok(a.withTools === 2 && t1.length === 2 && t1.includes('search_dalil_index') && t1.includes('pick_offers'), `2 AI rounds (search, pick by ref + comment), offered only search_dalil_index + pick_offers (${t1.join(', ')})`);
  ok(/INDEXPICK/.test(a.text) && !/NO_INDEX_MATCH/.test(a.text), `the AI writes the recommendation: "${a.text.slice(0, 40)}"`);
  ok(a.steps.includes('search_dalil_index') && a.steps.includes('pick_offers') && !a.steps.includes('web_search'), `steps: ${[...new Set(a.steps)].join(', ')}`);
  ok(a.offers.every((o) => o.sig && o.url && o.currency === 'PI'), 'cards are signed, linked and priced in Pi');
  ok(!a.offers.some((o) => /evil/i.test(o.title)), 'bad links from a store never become cards');
  console.log('index answer took', a.ms, 'ms');

  // 2. Nothing in the index fits → the full agent carries on; the marker never reaches the user.
  const b = await ask(tok, [{ role: 'user', text: 'INDEXFIRST zqxv flux capacitor' }]);
  ok(/Best pick/.test(b.text) && b.idx >= 2 && !/NO_INDEX_MATCH/.test(b.text), `no index match → full agent (${[...new Set(b.steps)].join(', ')}), text: "${b.text.slice(0, 40)}"`);

  // 3. Not in the index → the full agent (tools offered).
  const c = await ask(tok, [{ role: 'user', text: 'zqxv flux capacitor' }]);
  ok(c.withTools >= 1, `unknown product goes to the full agent (${c.withTools} tool rounds)`);

  // 3b. The long fixed part of the prompt is identical for every user (prompt cache), the context is at the end.
  const eg = await ask(tok, [{ role: 'user', text: 'zqxv one' }], { country: 'EG', lang: 'ar' });
  const us = await ask(tok, [{ role: 'user', text: 'zqxv two' }], { country: 'US', lang: 'en', scope: 'online' });
  const pr = await J(await fetch(META + '/__prompts'));
  const [p1, p2] = pr.slice(-2);
  const ctx1 = p1.indexOf('\nContext:\n');
  ok(ctx1 > 3000 && p1.slice(0, ctx1) === p2.slice(0, p2.indexOf('\nContext:\n')), `fixed prompt part (${ctx1} chars) is the same for EG/ar and US/en/online`);
  ok(p1.slice(ctx1).includes('Egypt') && p2.slice(ctx1).includes('United States'), 'country and language live in the Context block');
  ok(eg.status === 200 && us.status === 200, 'both answered');

  // A second user: 10 AI questions an hour per user.
  const tok2 = (await J(await post('/api/auth/pi', { dev: 'quicky2' }))).token;
  // 4. Local / services / follow-ups / photos / links → full agent.
  for (const [label, history, settings] of [
    ['near me', [{ role: 'user', text: 'headphones near me' }]],
    ['services scope', [{ role: 'user', text: 'headphones' }], { scope: 'services' }],
    ['follow-up', [{ role: 'user', text: 'headphones' }, { role: 'assistant', text: 'ok' }, { role: 'user', text: 'headphones' }]],
    ['question', [{ role: 'user', text: 'هل headphones دي كويسة؟' }]],
    ['link', [{ role: 'user', text: 'https://mall.salla-shop.com/product/x headphones' }]],
  ]) {
    const r = await ask(tok2, history, settings);
    ok(r.withTools >= 1 && r.idx === 0, `${label} → straight to the full agent (${r.withTools} tool rounds, ${r.idx} index-only)`);
  }
})().catch((e) => { console.log('FAIL crash ' + e.stack); process.exitCode = 1; });
