// Real agent runs on the live site with the real Meta model: how many offers are grounded, does "buy" get a card?
const BASE = process.env.BASE || 'https://paypalai-m.vercel.app';
const nd = (t) => t.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const cases = [
  ['US', 'en', 'New York', 'Find the cheapest Sony WH-1000XM5 headphones'],
  ['US', 'en', 'New York', 'buy AirPods Pro 3'],
  ['US', 'en', 'Chicago', 'best-rated air fryer under $120'],
  ['EG', 'ar', 'Cairo', 'عايز أشتري ايفون 16 برو ماكس ٢٥٦ جيجا'],
  ['EG', 'ar', 'Alexandria', 'ارخص سماعة JBL Tune 520BT'],
  ['US', 'en', 'Los Angeles', 'Is $99 for a Nintendo Switch 2 a real deal?'],
];
const only = process.env.CASES ? process.env.CASES.split(',').map(Number) : cases.map((_, i) => i);
(async () => {
  const out = [];
  await Promise.all(only.map(async (i) => {
    const [market, lang, city, text] = cases[i];
    const t0 = Date.now();
    const r = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-model-api-key': process.env.META_KEY }, body: JSON.stringify({ history: [{ role: 'user', text }], settings: { baseUrl: 'https://api.meta.ai/v1', model: 'muse-spark-1.3-contributor', reasoningEffort: 'low', market, city, lang, demoMode: false } }) });
    const ev = nd(await r.text());
    const offers = ev.filter((e) => e.type === 'block' && e.block.type === 'products').flatMap((e) => e.block.offers);
    const appr = ev.filter((e) => e.type === 'block' && e.block.type === 'approval').map((e) => e.block.offer);
    const unv = offers.filter((o) => o.flags.includes('price_unverified'));
    const err = ev.find((e) => e.type === 'error');
    const tools = ev.filter((e) => e.type === 'step').map((e) => e.step.tool).filter((v, k, a) => a.indexOf(v) === k);
    out[i] = `#${i} [${Math.round((Date.now() - t0) / 1000)}s] "${text}" → offers ${offers.length}, unverified ${unv.length}, approval ${appr.length}${appr.length ? ` (${appr.map((o) => `${o.store} ${o.total} ${o.flags.join('/')}`)})` : ''}${err ? ' ERROR ' + err.message : ''}\n     tools: ${tools.join(',')}\n     ${offers.map((o) => `${o.store} ${o.price}${o.currency}${o.flags.includes('price_unverified') ? '❗' : ''}`).join(' | ')}`;
    console.log(out[i]);
  }));
})();
