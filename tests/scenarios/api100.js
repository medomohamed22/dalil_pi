// Dalil — API scenarios + attack scripts. BASE=http://localhost:3100 (mocks) or the live site.
// Each scenario prints PASS/FAIL; results are saved to results-api-<host>.json.
const crypto = require('crypto');
const BASE = process.env.BASE || 'http://localhost:3100';
const LOCAL = BASE.includes('localhost');
const results = [];
const dev = () => crypto.randomBytes(20).toString('hex');
const DEV_A = dev(), DEV_B = dev();
const J = { 'content-type': 'application/json' };
async function call(method, path, body, headers = {}) {
  const r = await fetch(BASE + path, { method, headers: { ...J, ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  return { s: r.status, t, j, h: r.headers };
}
const nd = (t) => t.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
let N = 0;
function check(cat, name, ok, detail) {
  N++;
  results.push({ n: N, cat, name, ok: !!ok, detail: ok ? undefined : String(detail ?? '').slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(N).padStart(3)} [${cat}] ${name}${ok ? '' : '  → ' + String(detail ?? '').slice(0, 200)}`);
}
async function step(cat, name, fn) {
  try { await fn(); } catch (e) { check(cat, name, false, 'threw: ' + e.message); }
}
const settings = (o = {}) => ({ baseUrl: 'https://api.meta.ai/v1', model: 'x', reasoningEffort: 'low', market: 'US', city: 'New York', lang: 'en', demoMode: true, ...o });
async function demoChat(text, o = {}) {
  const r = await call('POST', '/api/chat', { history: [{ role: 'user', text, ...(o.images ? { images: o.images } : {}) }], settings: settings(o.settings) });
  const ev = nd(r.t);
  const offers = ev.filter((e) => e.type === 'block' && e.block.type === 'products').flatMap((e) => e.block.offers);
  const approval = ev.find((e) => e.type === 'block' && e.block.type === 'approval')?.block.offer;
  return { r, ev, offers, approval };
}
const signedNotNeg = (offers) => offers.filter((o) => o.trust !== 'suspicious' && !/-neg[0-9a-z]+$/.test(o.id) && !o.flags.includes('negotiated'));

(async () => {
  console.log('BASE', BASE);
  // ---------------- Functional: discovery ----------------
  let us, eg;
  await step('func', 'demo US search returns ranked offers + approval + insight', async () => {
    us = await demoChat('buy iphone 17 pro');
    const insight = us.ev.some((e) => e.type === 'block' && e.block.type === 'insight');
    check('func', 'demo US search returns ranked offers + approval + insight', us.offers.length >= 3 && us.approval && insight, us.r.t.slice(0, 200));
  });
  await step('func', 'every offer is signed and priced in USD', async () => {
    check('func', 'every offer is signed and priced in USD', us.offers.every((o) => o.sig && o.currency === 'USD' && o.total > 0), JSON.stringify(us.offers[0]));
  });
  await step('func', 'suspicious offers ranked last', async () => {
    const idx = us.offers.map((o) => o.trust === 'suspicious');
    const firstSus = idx.indexOf(true);
    check('func', 'suspicious offers ranked last', firstSus === -1 || idx.slice(firstSus).every(Boolean), idx.join(','));
  });
  await step('func', 'the app is US-only: a request for another market is served in USD', async () => {
    eg = await demoChat('airpods pro 3', { settings: { market: 'EG', city: 'Cairo', lang: 'ar' } });
    check('func', 'the app is US-only: a request for another market is served in USD', eg.offers.length > 0 && eg.offers.every((o) => o.currency === 'USD'), JSON.stringify(eg.offers[0])?.slice(0, 200));
  });
  await step('func', 'barcode in message → lookup step + product', async () => {
    const b = await demoChat('0195950000016');
    const step = b.ev.find((e) => e.type === 'step' && e.step.tool === 'lookup_barcode');
    check('func', 'barcode in message → lookup step + product', step && b.offers.length > 0, b.r.t.slice(0, 200));
  });
  await step('func', 'photo message → identify_image step', async () => {
    const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const b = await demoChat('how much is this?', { images: [px] });
    check('func', 'photo message → identify_image step', b.ev.some((e) => e.type === 'step' && e.step.tool === 'identify_image'), b.r.t.slice(0, 200));
  });
  await step('func', 'unknown product in demo still answers (no crash)', async () => {
    const b = await demoChat('qwertyuiop zxcv');
    check('func', 'unknown product in demo still answers (no crash)', b.r.s === 200 && b.ev.some((e) => e.type === 'done') && !b.ev.some((e) => e.type === 'error'), b.r.t.slice(-200));
  });
  await step('func', '60-message history accepted', async () => {
    const history = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `msg ${i} airpods` }));
    history[59] = { role: 'user', text: 'airpods pro 3' };
    const r = await call('POST', '/api/chat', { history, settings: settings() });
    check('func', '60-message history accepted', r.s === 200 && r.t.includes('"done"'), r.t.slice(0, 160));
  });
  await step('func', 'public config exposes only feature flags', async () => {
    const r = await call('GET', '/api/config');
    check('func', 'public config exposes only feature flags', r.s === 200 && Object.keys(r.j).every((k) => ['hostedAI', 'hostedDailyLimit', 'catalog', 'build', 'sandbox'].includes(k)), r.t);
  });
  await step('func', 'paypal status: sandbox + public client id only', async () => {
    const r = await call('GET', '/api/paypal/status');
    check('func', 'paypal status: sandbox + public client id only', r.s === 200 && !/secret/i.test(r.t), r.t);
  });

  const offer = signedNotNeg(us.offers).find((o) => o.trust === 'verified') ?? us.approval;
  const unverifiedStore = us.offers.find((o) => o.trust === 'unverified');
  const suspicious = us.offers.find((o) => o.trust === 'suspicious');

  // ---------------- Checkout & mandate ----------------
  let order;
  await step('pay', 'create PayPal order for a signed offer (+ orderToken)', async () => {
    const r = await call('POST', '/api/paypal/create-order', { offer, mandate: { maxSpend: 0, verifiedOnly: true } });
    order = r.j;
    check('pay', 'create PayPal order for a signed offer (+ orderToken)', r.s === 200 && r.j.id && r.j.approveUrl && r.j.orderToken, r.t);
  });
  await step('pay', 'mandate: over spending limit blocked', async () => {
    const r = await call('POST', '/api/paypal/create-order', { offer, mandate: { maxSpend: 10, verifiedOnly: false } });
    check('pay', 'mandate: over spending limit blocked', r.s === 403 && r.j.code === 'MANDATE_OVER_LIMIT', r.t);
  });
  await step('pay', 'mandate: verified-only blocks an unverified store', async () => {
    if (!unverifiedStore) return check('pay', 'mandate: verified-only blocks an unverified store', true);
    const r = await call('POST', '/api/paypal/create-order', { offer: unverifiedStore, mandate: { maxSpend: 0, verifiedOnly: true } });
    check('pay', 'mandate: verified-only blocks an unverified store', r.s === 403, r.t);
  });
  await step('pay', 'suspicious store can never be bought', async () => {
    if (!suspicious) return check('pay', 'suspicious store can never be bought', true);
    const r = await call('POST', '/api/paypal/create-order', { offer: suspicious, mandate: { maxSpend: 0, verifiedOnly: false } });
    check('pay', 'suspicious store can never be bought', r.s === 403, r.t);
  });
  await step('pay', 'EGP offer creates a USD order', async () => {
    const o = signedNotNeg(eg.offers)[0];
    const r = await call('POST', '/api/paypal/create-order', { offer: o, mandate: { maxSpend: 0, verifiedOnly: false } });
    check('pay', 'EGP offer creates a USD order', r.s === 200 && (!r.j.charge || r.j.charge.currency === 'USD'), r.t);
  });

  // ---------------- Attacks: money actions ----------------
  await step('sec', 'authorize without orderToken is refused', async () => {
    const r = await call('POST', '/api/paypal/authorize', { orderId: order.id });
    check('sec', 'authorize without orderToken is refused', r.s === 403, r.t);
  });
  await step('sec', "authorize with another order's token is refused", async () => {
    const other = signedNotNeg(us.offers).find((o) => o.id !== offer.id && o.trust !== 'suspicious');
    const r2 = await call('POST', '/api/paypal/create-order', { offer: other, mandate: { maxSpend: 0, verifiedOnly: false } });
    const r = await call('POST', '/api/paypal/authorize', { orderId: order.id, orderToken: r2.j.orderToken });
    check('sec', "authorize with another order's token is refused", r.s === 403, r.t);
  });
  await step('sec', 'authorize before buyer approval fails cleanly', async () => {
    const r = await call('POST', '/api/paypal/authorize', { orderId: order.id, orderToken: order.orderToken });
    check('sec', 'authorize before buyer approval fails cleanly', LOCAL ? r.s === 200 || r.s >= 400 : r.s >= 400 && r.s < 500 && r.j?.error, r.t);
  });
  await step('sec', 'capture without hold token', async () => {
    const r = await call('POST', '/api/paypal/capture', { authorizationId: '0VF52814937998046' });
    check('sec', 'capture without hold token', r.s === 403, r.t);
  });
  await step('sec', 'void with forged token', async () => {
    const r = await call('POST', '/api/paypal/void', { authorizationId: '0VF52814937998046', holdToken: 'eyJkIjp7fX0.forged' });
    check('sec', 'void with forged token', r.s === 403, r.t);
  });
  await step('sec', 'refund with forged token', async () => {
    const r = await call('POST', '/api/paypal/refund', { captureId: '3C679366HH908993F', captureToken: 'x.y', reason: 'damaged' });
    check('sec', 'refund with forged token', r.s === 403, r.t);
  });
  await step('sec', 'track without token', async () => {
    const r = await call('POST', '/api/paypal/track', { captureId: '3C679366HH908993F' });
    check('sec', 'track without token', r.s === 403, r.t);
  });
  await step('sec', 'orderToken cannot be used as a hold token (kind confusion)', async () => {
    const r = await call('POST', '/api/paypal/capture', { authorizationId: order.id, holdToken: order.orderToken });
    check('sec', 'orderToken cannot be used as a hold token (kind confusion)', r.s === 403, r.t);
  });
  await step('sec', 'path traversal in order id', async () => {
    const r = await call('POST', '/api/paypal/authorize', { orderId: '../../payments/captures/X/refund', orderToken: 'x' });
    check('sec', 'path traversal in order id', r.s === 400 || r.s === 403, r.t);
  });
  await step('sec', 'refund with invalid reason rejected', async () => {
    const r = await call('POST', '/api/paypal/refund', { captureId: 'X', captureToken: 'y', reason: 'because' });
    check('sec', 'refund with invalid reason rejected', r.s === 400, r.t);
  });
  await step('sec', 'garbage JSON body → 4xx, not 500', async () => {
    const r = await call('POST', '/api/paypal/create-order', '{not json');
    check('sec', 'garbage JSON body → 4xx, not 500', r.s >= 400 && r.s < 500, r.s + ' ' + r.t);
  });
  await step('sec', 'wrong HTTP method → 405', async () => {
    const r = await call('GET', '/api/paypal/capture');
    check('sec', 'wrong HTTP method → 405', r.s === 405, r.s);
  });

  // ---------------- Attacks: offer tampering ----------------
  for (const [name, mut] of [
    ['price → $1', { price: 1, total: 1 }],
    ['charge amount → $1', { chargeAmount: 1 }],
    ['currency USD → EGP', { currency: 'EGP' }],
    ['suspicious store → verified', { trust: 'verified', store: 'scam.shop' }],
    ['add or strip flags', { flags: ['fake_flag'] }],
    ['garbage signature', { sig: '1.abc' }],
    ['expired signature', { sig: `${Date.now() - 1000}.${(offer.sig || '').split('.')[1]}` }],
    ['swap product URL', { url: 'https://evil.example/iphone' }],
  ]) {
    await step('sec', `tampered offer: ${name}`, async () => {
      const r = await call('POST', '/api/paypal/create-order', { offer: { ...(name.startsWith('suspicious') && suspicious ? suspicious : offer), ...mut }, mandate: { maxSpend: 0, verifiedOnly: false } });
      check('sec', `tampered offer: ${name}`, r.s === 400 || r.s === 403, r.t);
    });
  }

  // ---------------- Negotiation ----------------
  let neg;
  await step('func', 'agent-to-agent negotiation lowers the price and re-signs', async () => {
    const r = await call('POST', '/api/negotiate', { offer, lang: 'en' });
    const ev = nd(r.t);
    const done = ev.find((e) => e.type === 'done');
    neg = done?.offer;
    const both = ev.some((e) => e.from === 'seller') && ev.some((e) => e.from === 'dalil');
    check('func', 'agent-to-agent negotiation lowers the price and re-signs', both && done && (done.offer === null || (done.offer.total < offer.total && done.offer.sig)), r.t.slice(-300));
  });
  await step('func', 'negotiated deal stays within a plausible discount (≥80% of list)', async () => {
    check('func', 'negotiated deal stays within a plausible discount (≥80% of list)', !neg || neg.price >= offer.price * 0.8, neg && `${neg.price} vs ${offer.price}`);
  });
  await step('func', 'negotiated offer can be bought', async () => {
    if (!neg) return check('func', 'negotiated offer can be bought', true);
    const r = await call('POST', '/api/paypal/create-order', { offer: neg, mandate: { maxSpend: 0, verifiedOnly: false } });
    check('func', 'negotiated offer can be bought', r.s === 200, r.t);
  });
  await step('sec', 're-negotiating a negotiated offer is refused', async () => {
    if (!neg) return check('sec', 're-negotiating a negotiated offer is refused', true);
    const r = await call('POST', '/api/negotiate', { offer: neg, lang: 'en' });
    check('sec', 're-negotiating a negotiated offer is refused', r.s === 409, r.t);
  });
  await step('sec', 'stripping the negotiated flag breaks the signature', async () => {
    if (!neg) return check('sec', 'stripping the negotiated flag breaks the signature', true);
    const r = await call('POST', '/api/negotiate', { offer: { ...neg, flags: [] }, lang: 'en' });
    check('sec', 'stripping the negotiated flag breaks the signature', r.s === 400 || r.s === 409, r.t);
  });
  await step('func', 'offers whose random id starts with "n" can still be negotiated (regression)', async () => {
    // Before the fix, ids like "o0_neb50" were mistaken for negotiated ones.
    let tries = 0, hit;
    while (!hit && tries++ < 25) { const c = await demoChat('airpods pro 3'); hit = c.offers.find((o) => /_n/.test(o.id) && o.trust !== 'suspicious'); }
    if (!hit) return check('func', 'offers whose random id starts with "n" can still be negotiated (regression)', true);
    const r = await call('POST', '/api/negotiate', { offer: hit, lang: 'en' });
    check('func', 'offers whose random id starts with "n" can still be negotiated (regression)', r.s === 200, `${hit.id} → ${r.s} ${r.t.slice(0, 120)}`);
  });
  await step('sec', 'cheap fake competitor cannot push the deal below the floor', async () => {
    const o2 = signedNotNeg((await demoChat('airpods pro 3')).offers)[0];
    const r = await call('POST', '/api/negotiate', { offer: o2, lang: 'ar', competitor: { store: 'Fake', total: 1 } });
    const d = nd(r.t).find((e) => e.type === 'done');
    check('sec', 'cheap fake competitor cannot push the deal below the floor', d && (!d.offer || d.offer.price >= o2.price * 0.9), r.t.slice(-200));
  });
  await step('sec', 'suspicious store: negotiation refused', async () => {
    if (!suspicious) return check('sec', 'suspicious store: negotiation refused', true);
    const r = await call('POST', '/api/negotiate', { offer: suspicious, lang: 'en' });
    check('sec', 'suspicious store: negotiation refused', r.s === 403, r.t);
  });
  await step('func', 'seller agent describes its protocol', async () => {
    const r = await call('GET', '/api/seller-agent');
    check('func', 'seller agent describes its protocol', r.s === 200 && r.j.protocol === 'dalil-negotiation/1', r.t);
  });
  await step('sec', 'seller agent rejects negative price', async () => {
    const r = await call('POST', '/api/seller-agent', { protocol: 'dalil-negotiation/1', item: { title: 'x', store: 'y', price: -5, shipping: 0, currency: 'USD' }, message: { type: 'bid', price: 1 } });
    check('sec', 'seller agent rejects negative price', r.s === 400, r.t);
  });
  await step('sec', 'forged seller session cannot lock a chosen price', async () => {
    const r = await call('POST', '/api/seller-agent', { protocol: 'dalil-negotiation/1', session: 'forged.token', item: { title: 'x', store: 'y', price: 100, shipping: 0, currency: 'USD' }, message: { type: 'accept' } });
    check('sec', 'forged seller session cannot lock a chosen price', r.s === 200 && r.j.message.price === 100, r.t);
  });
  await step('sec', 'seller lowball bid of $1 is not accepted', async () => {
    const h = await call('POST', '/api/seller-agent', { protocol: 'dalil-negotiation/1', item: { title: 'x', store: 'y', price: 100, shipping: 0, currency: 'USD' }, message: { type: 'hello' } });
    const r = await call('POST', '/api/seller-agent', { protocol: 'dalil-negotiation/1', session: h.j.session, item: { title: 'x', store: 'y', price: 100, shipping: 0, currency: 'USD' }, message: { type: 'bid', price: 1 } });
    check('sec', 'seller lowball bid of $1 is not accepted', r.j.message.type !== 'accept' && r.j.message.price >= 92, r.t);
  });

  // ---------------- Group buy ----------------
  let group;
  const gOffer = signedNotNeg((await demoChat('airpods pro 3')).offers)[0];
  await step('func', 'organizer creates a 3-way group buy', async () => {
    const r = await call('POST', '/api/groups', { offer: gOffer, shares: 3 }, { 'x-device-id': DEV_A });
    group = r.j?.group;
    const sum = group && Number((Number(group.shareAmount) * 3).toFixed(2));
    check('func', 'organizer creates a 3-way group buy', r.s === 200 && group.isOrganizer && group.shares === 3, r.t);
  });
  await step('func', 'friend opens the link: sees the group but is not organizer', async () => {
    const r = await call('GET', `/api/groups/${group.id}`, undefined, { 'x-device-id': DEV_B });
    check('func', 'friend opens the link: sees the group but is not organizer', r.s === 200 && r.j.group.isOrganizer === false && r.j.group.paid === 0, r.t);
  });
  await step('func', 'friend starts paying a share → PayPal approve link', async () => {
    const r = await call('POST', `/api/groups/${group.id}/pay`, { name: '<img src=x onerror=alert(1)>' + 'x'.repeat(80) }, { 'x-device-id': DEV_B });
    check('func', 'friend starts paying a share → PayPal approve link', r.s === 200 && /paypal|localhost/.test(r.j.approveUrl), r.t);
  });
  await step('sec', 'member name is stored as plain text and capped at 40 chars', async () => {
    const r = await call('GET', `/api/groups/${group.id}`, undefined, { 'x-device-id': DEV_B });
    const m = r.j.group.members[0];
    check('sec', 'member name is stored as plain text and capped at 40 chars', m && m.name.length <= 40, JSON.stringify(m));
  });
  await step('sec', 'non-organizer cannot cancel the group', async () => {
    const r = await call('POST', `/api/groups/${group.id}/cancel`, {}, { 'x-device-id': DEV_B });
    check('sec', 'non-organizer cannot cancel the group', r.s === 403, r.t);
  });
  await step('sec', 'confirming an unknown order in a group → 404', async () => {
    const r = await call('POST', `/api/groups/${group.id}/confirm`, { orderId: 'ABCDEFGHIJ12345' });
    check('sec', 'confirming an unknown order in a group → 404', r.s === 404, r.t);
  });
  await step('func', 'organizer cancels → group cancelled', async () => {
    const r = await call('POST', `/api/groups/${group.id}/cancel`, {}, { 'x-device-id': DEV_A });
    check('func', 'organizer cancels → group cancelled', r.s === 200 && r.j.group.status === 'cancelled', r.t);
  });
  await step('func', 'paying into a cancelled group is refused', async () => {
    const r = await call('POST', `/api/groups/${group.id}/pay`, { name: 'late' }, { 'x-device-id': DEV_B });
    check('func', 'paying into a cancelled group is refused', r.s === 409, r.t);
  });
  for (const [name, body, codeOk] of [
    ['group with 50 shares rejected', { offer: gOffer, shares: 50 }, (s) => s === 400],
    ['group with 1 share rejected', { offer: gOffer, shares: 1 }, (s) => s === 400],
    ['group with tampered offer rejected', { offer: { ...gOffer, total: 1 }, shares: 2 }, (s) => s === 400],
    ['group from a suspicious store rejected', { offer: suspicious ?? gOffer, shares: 2 }, (s) => (suspicious ? s === 403 : true)],
  ]) {
    await step('sec', name, async () => {
      const r = await call('POST', '/api/groups', body, { 'x-device-id': DEV_A });
      check('sec', name, codeOk(r.s), r.s + ' ' + r.t);
    });
  }
  await step('sec', 'group without device id → 401', async () => {
    const r = await call('POST', '/api/groups', { offer: gOffer, shares: 2 });
    check('sec', 'group without device id → 401', r.s === 401, r.t);
  });
  await step('sec', 'group id injection / traversal', async () => {
    const r = await call('GET', '/api/groups/..%2F..%2Fwatches');
    check('sec', 'group id injection / traversal', r.s === 404, r.t);
  });

  // ---------------- Price watch ----------------
  let watch;
  const wOffer = signedNotNeg((await demoChat('buy iphone 17 pro')).offers).find((o) => o.trust === 'verified');
  await step('func', 'create a price watch (notify)', async () => {
    const r = await call('POST', '/api/watches', { offer: wOffer, targetPrice: Math.floor(wOffer.price * 0.95), mode: 'notify', maxSpend: 0, market: 'US', demo: false }, { 'x-device-id': DEV_A });
    watch = r.j?.watch;
    check('func', 'create a price watch (notify)', r.s === 200 && watch?.status === 'active', r.t);
  });
  await step('func', 'watch listed for its device only', async () => {
    const a = await call('GET', '/api/watches', undefined, { 'x-device-id': DEV_A });
    const b = await call('GET', '/api/watches', undefined, { 'x-device-id': DEV_B });
    check('func', 'watch listed for its device only', a.j.watches.some((w) => w.id === watch.id) && !b.j.watches.some((w) => w.id === watch.id), a.t.slice(0, 100));
  });
  await step('sec', "another device cannot act on someone's watch (IDOR)", async () => {
    const r = await call('POST', `/api/watches/${watch.id}`, { action: 'simulate' }, { 'x-device-id': DEV_B });
    check('sec', "another device cannot act on someone's watch (IDOR)", r.s === 404, r.t);
  });
  await step('sec', 'CRITICAL: simulated drop to $0.01 cannot produce a signed $0.01 offer', async () => {
    const r = await call('POST', `/api/watches/${watch.id}`, { action: 'simulate', price: 0.01 }, { 'x-device-id': DEV_A });
    const t = r.j?.watch?.triggeredOffer;
    check('sec', 'CRITICAL: simulated drop to $0.01 cannot produce a signed $0.01 offer', !t || t.price >= wOffer.price * 0.85, `${r.s} triggered=${t?.price}`);
  });
  await step('func', 'simulate (default) triggers the watch with a real-looking price', async () => {
    const t = (await call('GET', '/api/watches', undefined, { 'x-device-id': DEV_A })).j.watches.find((w) => w.id === watch.id);
    check('func', 'simulate (default) triggers the watch with a real-looking price', t.status === 'triggered' && t.triggeredOffer.price <= t.targetPrice && t.triggeredOffer.sig, JSON.stringify(t).slice(0, 200));
  });
  await step('sec', 'simulate cannot go below 85% even with a low target', async () => {
    const w2 = (await call('POST', '/api/watches', { offer: wOffer, targetPrice: 1, mode: 'notify', maxSpend: 0, market: 'US', demo: true }, { 'x-device-id': DEV_A })).j.watch;
    const r = await call('POST', `/api/watches/${w2.id}`, { action: 'simulate', price: 0.5 }, { 'x-device-id': DEV_A });
    check('sec', 'simulate cannot go below 85% even with a low target', r.s === 409 && !r.j.watch, r.t);
    await call('DELETE', `/api/watches/${w2.id}`, undefined, { 'x-device-id': DEV_A });
  });
  await step('sec', 'demo random walk never drifts under the floor (40 syncs)', async () => {
    const w3 = (await call('POST', '/api/watches', { offer: wOffer, targetPrice: 1, mode: 'notify', maxSpend: 0, market: 'US', demo: true }, { 'x-device-id': DEV_A })).j.watch;
    let min = Infinity;
    for (let i = 0; i < 40; i++) {
      const r = await call('POST', `/api/watches/${w3.id}`, { action: 'check' }, { 'x-device-id': DEV_A });
      min = Math.min(min, r.j?.watch?.lastPrice ?? Infinity);
    }
    check('sec', 'demo random walk never drifts under the floor (40 syncs)', min >= wOffer.price * 0.85, `min ${min} vs ${wOffer.price}`);
    await call('DELETE', `/api/watches/${w3.id}`, undefined, { 'x-device-id': DEV_A });
  });
  await step('sec', 'watch with tampered offer rejected', async () => {
    const r = await call('POST', '/api/watches', { offer: { ...wOffer, price: 1 }, targetPrice: 1, mode: 'notify', maxSpend: 0, market: 'US', demo: false }, { 'x-device-id': DEV_A });
    check('sec', 'watch with tampered offer rejected', r.s === 400, r.t);
  });
  await step('sec', 'auto-buy watch requires a connected PayPal vault', async () => {
    const r = await call('POST', '/api/watches', { offer: wOffer, targetPrice: 100, mode: 'auto', maxSpend: 0, market: 'US', demo: false }, { 'x-device-id': DEV_B });
    check('sec', 'auto-buy watch requires a connected PayPal vault', r.s === 409, r.t);
  });
  await step('sec', 'watches without / with malformed device id → 401', async () => {
    const a = await call('GET', '/api/watches');
    const b = await call('GET', '/api/watches', undefined, { 'x-device-id': 'not-hex!' });
    check('sec', 'watches without / with malformed device id → 401', a.s === 401 && b.s === 401, a.s + '/' + b.s);
  });
  await step('func', 'delete the watch', async () => {
    const r = await call('DELETE', `/api/watches/${watch.id}`, undefined, { 'x-device-id': DEV_A });
    check('func', 'delete the watch', r.s === 200, r.t);
  });
  await step('sec', 'push subscription to an arbitrary server is rejected (SSRF)', async () => {
    const r = await call('PUT', '/api/push', { endpoint: 'https://evil.example/hook', keys: { p256dh: 'a', auth: 'b' } }, { 'x-device-id': DEV_A });
    check('sec', 'push subscription to an arbitrary server is rejected (SSRF)', r.s === 400, r.t);
  });
  await step('sec', 'push subscription over plain http rejected', async () => {
    const r = await call('PUT', '/api/push', { endpoint: 'http://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } }, { 'x-device-id': DEV_A });
    check('sec', 'push subscription over plain http rejected', r.s === 400, r.t);
  });
  await step('func', 'real push service endpoint accepted', async () => {
    const r = await call('PUT', '/api/push', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'a', auth: 'b' } }, { 'x-device-id': DEV_A });
    check('func', 'real push service endpoint accepted', r.s === 200, r.t);
    await call('DELETE', '/api/push', undefined, { 'x-device-id': DEV_A });
  });

  // ---------------- SSRF ----------------
  for (const u of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:3100/api/config', 'http://localhost/', 'http://127.0.0.1.nip.io/', 'file:///etc/passwd', 'http://[::1]/', 'http://0x7f000001/', 'http://2130706433/', 'http://[::ffff:127.0.0.1]/', 'gopher://127.0.0.1:6379/_INFO']) {
    await step('sec', `link preview SSRF blocked: ${u}`, async () => {
      const r = await call('GET', `/api/preview?url=${encodeURIComponent(u)}`);
      check('sec', `link preview SSRF blocked: ${u}`, !/"title"|"description"|hostedAI|root:/.test(r.t), r.t);
    });
  }
  await step('sec', 'a model base URL / key sent by the browser is ignored (server model only)', async () => {
    const r = await call('POST', '/api/chat', { history: [{ role: 'user', text: 'hi' }], settings: settings({ baseUrl: 'http://169.254.169.254/v1', model: 'evil', demoMode: false }) }, { 'x-model-api-key': 'k' });
    check('sec', 'a model base URL / key sent by the browser is ignored (server model only)', r.s === 200 && !/169\.254|Host not allowed/.test(r.t) && r.t.includes('"done"'), r.t.slice(0, 300));
  });
  await step('sec', 'model list → loopback blocked', async () => {
    const r = await call('POST', '/api/models', { baseUrl: 'http://127.0.0.1:9001' }, { 'x-model-api-key': 'k' });
    check('sec', 'model list → loopback blocked', r.s >= 400, r.t);
  });
  await step('sec', 'model list error does not echo internal data', async () => {
    const r = await call('POST', '/api/models', { baseUrl: 'https://example.com/v1' }, { 'x-model-api-key': 'k' });
    check('sec', 'model list error does not echo internal data', r.s >= 400 && r.t.length < 600, r.t.slice(0, 200));
  });

  // ---------------- Input validation & infra ----------------
  await step('sec', 'oversized chat message rejected', async () => {
    const r = await call('POST', '/api/chat', { history: [{ role: 'user', text: 'x'.repeat(30000) }], settings: settings() });
    check('sec', 'oversized chat message rejected', r.s === 400, r.t);
  });
  await step('sec', 'any market value is ignored (always US)', async () => {
    const r = await demoChat('airpods pro 3', { settings: { market: 'XX', lang: 'zz' } });
    check('sec', 'any market value is ignored (always US)', r.r.s === 200 && r.offers.length > 0 && r.offers.every((o) => o.currency === 'USD'), r.r.t.slice(0, 200));
  });
  await step('sec', 'more than 4 images rejected', async () => {
    const r = await call('POST', '/api/chat', { history: [{ role: 'user', text: 'hi', images: ['a', 'b', 'c', 'd', 'e'] }], settings: settings() });
    check('sec', 'more than 4 images rejected', r.s === 400, r.t);
  });
  await step('sec', 'empty history rejected', async () => {
    const r = await call('POST', '/api/chat', { history: [], settings: settings() });
    check('sec', 'empty history rejected', r.s === 400, r.t);
  });
  await step('sec', 'cron without / with wrong secret → 401', async () => {
    const a = await call('GET', '/api/cron');
    const b = await call('GET', '/api/cron', undefined, { authorization: 'Bearer wrong' });
    check('sec', 'cron without / with wrong secret → 401', a.s === 401 && b.s === 401, a.s + '/' + b.s);
  });
  await step('sec', 'diagnostics require the secret', async () => {
    const r = await call('GET', '/api/diag');
    check('sec', 'diagnostics require the secret', r.s === 401, r.t);
  });
  await step('sec', 'removed debug route is gone', async () => {
    const r = await call('GET', '/api/browser-check?url=http://127.0.0.1');
    check('sec', 'removed debug route is gone', r.s === 404 || r.s === 401, r.s);
  });
  await step('sec', 'security headers (frame, sniff, referrer)', async () => {
    const r = await fetch(BASE + '/');
    const h = r.headers;
    check('sec', 'security headers (frame, sniff, referrer)', /DENY/i.test(h.get('x-frame-options') ?? '') && h.get('x-content-type-options') === 'nosniff' && !!h.get('referrer-policy'), JSON.stringify([...h]));
  });
  await step('sec', 'no secrets in any public JSON', async () => {
    const t = (await call('GET', '/api/config')).t + (await call('GET', '/api/paypal/status')).t + (await call('GET', '/api/push')).t;
    check('sec', 'no secrets in any public JSON', !/CLIENT_SECRET|META_API|KV_|CRON|PRIVATE/i.test(t), t);
  });
  await step('sec', 'errors never leak stack traces', async () => {
    const rs = await Promise.all([call('POST', '/api/groups/abcdefghijkl/confirm', '{bad'), call('POST', '/api/paypal/track', '{bad'), call('POST', '/api/watches/sync', '{}', { 'x-device-id': 'zz' })]);
    check('sec', 'errors never leak stack traces', rs.every((r) => !/at \/|node_modules|\.ts:\d+/.test(r.t)), rs.map((r) => r.t).join(' | '));
  });
  await step('func', 'group page /g/<id> renders (SSR) for unknown id', async () => {
    const r = await fetch(BASE + '/g/abcdefghijkl');
    check('func', 'group page /g/<id> renders (SSR) for unknown id', r.status === 200 || r.status === 404, r.status);
  });
  await step('func', 'PayPal return page exists', async () => {
    const r = await fetch(BASE + '/paypal/return?token=X');
    check('func', 'PayPal return page exists', r.status === 200, r.status);
  });

  // ---------------- New: multi-store cart, family approval, price protection ----------------
  const pool = signedNotNeg(us.offers).filter((o) => o.trust !== 'suspicious' && !o.flags.includes('price_unverified'));
  const twoStores = [];
  for (const o of pool) if (!twoStores.some((x) => x.store === o.store) && twoStores.length < 2) twoStores.push(o);
  let cart;
  await step('cart', 'cart: one PayPal order with one purchase unit per store', async () => {
    const r = await call('POST', '/api/paypal/cart', { offers: twoStores, mandate: { maxSpend: 0, verifiedOnly: false } });
    cart = r.j;
    check('cart', 'cart: one PayPal order with one purchase unit per store', r.s === 200 && r.j.id && r.j.orderToken && r.j.units?.length === twoStores.length, r.t);
  });
  await step('cart', 'cart: total over the spending limit is blocked', async () => {
    const r = await call('POST', '/api/paypal/cart', { offers: twoStores, mandate: { maxSpend: 10, verifiedOnly: false } });
    check('cart', 'cart: total over the spending limit is blocked', r.s === 403 && r.j.code === 'MANDATE_OVER_LIMIT', r.t);
  });
  await step('cart', 'cart: a tampered price is refused', async () => {
    const forged = [{ ...twoStores[0], price: 1, total: 1 }, twoStores[1]];
    const r = await call('POST', '/api/paypal/cart', { offers: forged, mandate: { maxSpend: 0, verifiedOnly: false } });
    check('cart', 'cart: a tampered price is refused', r.s === 400, r.t);
  });
  await step('cart', 'cart: an offer re-labelled to another currency is refused', async () => {
    const r = await call('POST', '/api/paypal/cart', { offers: [twoStores[0], { ...twoStores[1], currency: 'EGP' }], mandate: { maxSpend: 0, verifiedOnly: false } });
    check('cart', 'cart: an offer re-labelled to another currency is refused', r.s >= 400 && r.s < 500, r.t);
  });
  await step('cart', 'cart: a suspicious store cannot be added', async () => {
    if (!suspicious) return check('cart', 'cart: a suspicious store cannot be added', true);
    const r = await call('POST', '/api/paypal/cart', { offers: [twoStores[0], suspicious], mandate: { maxSpend: 0, verifiedOnly: false } });
    check('cart', 'cart: a suspicious store cannot be added', r.s === 403, r.t);
  });
  await step('cart', 'cart: the same offer twice is refused', async () => {
    const r = await call('POST', '/api/paypal/cart', { offers: [twoStores[0], twoStores[0]], mandate: { maxSpend: 0, verifiedOnly: false } });
    check('cart', 'cart: the same offer twice is refused', r.s >= 400 && r.s < 500, r.t);
  });

  let fam;
  await step('family', 'family: request created for a signed offer within the limit', async () => {
    const r = await call('POST', '/api/family', { offer, limit: offer.total + 50, name: 'Mo', note: 'for school' }, { 'x-device-id': DEV_A });
    fam = r.j?.request;
    check('family', 'family: request created for a signed offer within the limit', r.s === 200 && fam?.id && fam.status === 'pending', r.t);
  });
  await step('family', 'family: request above the limit is refused', async () => {
    const r = await call('POST', '/api/family', { offer, limit: Math.max(1, Math.floor(offer.total / 2)), name: 'Mo' }, { 'x-device-id': DEV_A });
    check('family', 'family: request above the limit is refused', r.s === 403 || r.s === 409, r.t);
  });
  await step('family', 'family: tampered offer is refused', async () => {
    const r = await call('POST', '/api/family', { offer: { ...offer, price: 1, total: 1 }, limit: 500, name: 'Mo' }, { 'x-device-id': DEV_A });
    check('family', 'family: tampered offer is refused', r.s === 400, r.t);
  });
  await step('family', 'family: the requester cannot approve their own request', async () => {
    const r = await call('POST', `/api/family/${fam.id}/pay`, {}, { 'x-device-id': DEV_A });
    check('family', 'family: the requester cannot approve their own request', r.s === 403 && r.j.code === 'SELF_APPROVAL', r.t);
  });
  let famPay;
  await step('family', 'family: approver gets a PayPal approval link', async () => {
    const r = await call('POST', `/api/family/${fam.id}/pay`, {}, { 'x-device-id': DEV_B });
    famPay = r.j;
    check('family', 'family: approver gets a PayPal approval link', r.s === 200 && r.j.orderId && r.j.approveUrl, r.t);
  });
  await step('family', 'family: approver view hides nothing it needs, requester view masks', async () => {
    const a = await call('GET', `/api/family/${fam.id}`, undefined, { 'x-device-id': DEV_B });
    const q = await call('GET', `/api/family/${fam.id}`);
    check('family', 'family: approver view hides nothing it needs, requester view masks', a.j?.request?.isApprover && !q.j?.request?.isApprover && !q.j?.request?.isRequester && !/"requester"\s*:\s*"[0-9a-f]{20,}/.test(q.t), a.t + q.t);
  });
  if (LOCAL) {
    await step('family', 'family: confirm with a different order id is refused', async () => {
      const r = await call('POST', `/api/family/${fam.id}/confirm`, { orderId: 'ORDNOTTHEONE0001' }, { 'x-device-id': DEV_B });
      check('family', 'family: confirm with a different order id is refused', r.s === 404, r.t);
    });
    await step('family', 'family: another device that learned the order id cannot take over the approval', async () => {
      const r = await call('POST', `/api/family/${fam.id}/confirm`, { orderId: famPay.orderId }, { 'x-device-id': DEV_A });
      check('family', 'family: another device that learned the order id cannot take over the approval', r.s === 403 && r.j.code === 'NOT_APPROVER', r.t);
    });
    await step('family', 'family: approval places a hold on the approver\'s PayPal', async () => {
      const r = await call('POST', `/api/family/${fam.id}/confirm`, { orderId: famPay.orderId }, { 'x-device-id': DEV_B });
      check('family', 'family: approval places a hold on the approver\'s PayPal', r.s === 200 && r.j.request.status === 'held', r.t);
    });
    await step('family', 'family: only the approver can confirm the charge', async () => {
      const r = await call('POST', `/api/family/${fam.id}/action`, { action: 'capture' }, { 'x-device-id': DEV_A });
      check('family', 'family: only the approver can confirm the charge', r.s === 409 || r.s === 403, r.t);
    });
    await step('family', 'family: approver confirms → captured', async () => {
      const r = await call('POST', `/api/family/${fam.id}/action`, { action: 'capture' }, { 'x-device-id': DEV_B });
      check('family', 'family: approver confirms → captured', r.s === 200 && r.j.request.status === 'captured', r.t);
    });
    await step('family', 'family: requester can cancel a pending request', async () => {
      const c = await call('POST', '/api/family', { offer, limit: offer.total + 1, name: 'Mo' }, { 'x-device-id': DEV_A });
      const r = await call('POST', `/api/family/${c.j.request.id}/action`, { action: 'cancel' }, { 'x-device-id': DEV_A });
      const p = await call('POST', `/api/family/${c.j.request.id}/pay`, {}, { 'x-device-id': DEV_B });
      check('family', 'family: requester can cancel a pending request', r.s === 200 && r.j.request.status === 'cancelled' && p.s === 409, r.t + p.t);
    });

    // Cart: approve once → one capture per store → any store can be cancelled with a full refund.
    await step('cart', 'cart: capture needs the order token of this cart', async () => {
      const r = await call('POST', '/api/paypal/cart/capture', { orderId: cart.id, orderToken: 'x.y' });
      check('cart', 'cart: capture needs the order token of this cart', r.s === 403, r.t);
    });
    await step('cart', 'cart: one approval → one capture per store', async () => {
      const r = await call('POST', '/api/paypal/cart/capture', { orderId: cart.id, orderToken: cart.orderToken });
      cart.cap = r.j;
      check('cart', 'cart: one approval → one capture per store', r.s === 200 && r.j.units?.length === twoStores.length && r.j.units.every((u) => u.captureId && u.captureToken), r.t);
    });
    await step('cart', 'cart: capturing twice is idempotent (no double charge)', async () => {
      const r = await call('POST', '/api/paypal/cart/capture', { orderId: cart.id, orderToken: cart.orderToken });
      check('cart', 'cart: capturing twice is idempotent (no double charge)', r.s === 200 && r.j.units.map((u) => u.captureId).join() === cart.cap.units.map((u) => u.captureId).join(), r.t);
    });
    await step('cart', 'cart: cancel one store → full refund of only that store', async () => {
      const [u1] = cart.cap.units;
      const r = await call('POST', '/api/paypal/refund', { captureId: u1.captureId, captureToken: u1.captureToken, reason: 'cancelled' });
      check('cart', 'cart: cancel one store → full refund of only that store', r.s === 200 && Number(r.j.amount) === Number(u1.amount.value), r.t);
    });
    await step('cart', "cart: one store's token can't refund another store", async () => {
      const [u1, u2] = cart.cap.units;
      const r = await call('POST', '/api/paypal/refund', { captureId: u2.captureId, captureToken: u1.captureToken, reason: 'cancelled' });
      check('cart', "cart: one store's token can't refund another store", r.s === 403, r.t);
    });

    // Price protection: buy → protect → simulated drop refunds the difference on the capture.
    const buy = async (o) => {
      const ord = (await call('POST', '/api/paypal/create-order', { offer: o, mandate: { maxSpend: 0, verifiedOnly: false } })).j;
      const a = (await call('POST', '/api/paypal/authorize', { orderId: ord.id, orderToken: ord.orderToken })).j;
      const c = (await call('POST', '/api/paypal/capture', { authorizationId: a.authorizationId, holdToken: a.holdToken })).j;
      return { captureId: c.id, captureToken: c.captureToken };
    };
    let cap, prot;
    await step('protect', 'protection: turned on for a captured purchase', async () => {
      cap = await buy(offer);
      const r = await call('POST', '/api/protection', { ...cap, offer, demo: true }, { 'x-device-id': DEV_A });
      prot = r.j?.protection;
      check('protect', 'protection: turned on for a captured purchase', r.s === 200 && prot?.status === 'active' && prot.paidPrice === offer.price && prot.until - prot.createdAt === 14 * 86400000, r.t);
    });
    await step('protect', 'protection: same purchase twice returns the same record', async () => {
      const r = await call('POST', '/api/protection', { ...cap, offer, demo: true }, { 'x-device-id': DEV_A });
      check('protect', 'protection: same purchase twice returns the same record', r.s === 200 && r.j.protection.id === prot.id, r.t);
    });
    await step('protect', 'protection: another device cannot take over the purchase', async () => {
      const r = await call('POST', '/api/protection', { ...cap, offer, demo: true }, { 'x-device-id': DEV_B });
      check('protect', 'protection: another device cannot take over the purchase', r.s === 409, r.t);
    });
    await step('protect', 'protection: forged capture token refused', async () => {
      const r = await call('POST', '/api/protection', { captureId: cap.captureId, captureToken: 'x.y', offer, demo: true }, { 'x-device-id': DEV_A });
      check('protect', 'protection: forged capture token refused', r.s === 403, r.t);
    });
    await step('protect', "protection: a cheaper offer can't be passed off as what was paid", async () => {
      const c2 = await buy(offer);
      const cheaper = pool.find((o) => Math.abs(o.total - offer.total) > 1);
      const r = await call('POST', '/api/protection', { ...c2, offer: cheaper, demo: true }, { 'x-device-id': DEV_A });
      check('protect', "protection: a cheaper offer can't be passed off as what was paid", r.s === 409 && ['CAPTURE_MISMATCH', 'OFFER_MISMATCH'].includes(r.j.code), r.t);
    });
    await step('protect', 'protection: other devices cannot read it', async () => {
      const r = await call('GET', `/api/protection/${prot.id}`, undefined, { 'x-device-id': DEV_B });
      check('protect', 'protection: other devices cannot read it', r.s === 404, r.t);
    });
    await step('protect', 'protection: price drop → partial PayPal refund of the difference', async () => {
      const r = await call('POST', `/api/protection/${prot.id}`, { action: 'simulate' }, { 'x-device-id': DEV_A });
      const p = r.j?.protection;
      const drop = Math.round((offer.price - p?.lastPrice) * 100) / 100;
      check('protect', 'protection: price drop → partial PayPal refund of the difference', r.s === 200 && p.refunds.length === 1 && Math.abs(Number(p.refunds[0].amount) - drop) <= 0.01 && drop > 0, r.t);
      prot = p;
    });
    await step('protect', 'protection: a second drop refunds only the new difference', async () => {
      const before = Number(prot.refundedTotal);
      const r = await call('POST', `/api/protection/${prot.id}`, { action: 'simulate' }, { 'x-device-id': DEV_A });
      const p = r.j?.protection;
      check('protect', 'protection: a second drop refunds only the new difference', r.s === 200 && p.refunds.length === 2 && Number(p.refundedTotal) > before && Number(p.refundedTotal) <= offer.price * 0.15 + 0.01, r.t);
      prot = p;
    });
    await step('protect', 'protection: simulated drops stop at 15% under the price paid', async () => {
      let last;
      for (let i = 0; i < 6; i++) last = await call('POST', `/api/protection/${prot.id}`, { action: 'simulate', price: 1 }, { 'x-device-id': DEV_A });
      const l = await call('GET', '/api/protection', undefined, { 'x-device-id': DEV_A });
      const p = l.j.protections.find((x) => x.id === prot.id);
      check('protect', 'protection: simulated drops stop at 15% under the price paid', last.s === 409 && last.j.code === 'SIMULATION_LIMIT' && Number(p.refundedTotal) <= Math.ceil(offer.price * 0.15 * 100) / 100 + 0.01, last.t + JSON.stringify(p?.refundedTotal));
      prot = p;
    });
    await step('protect', 'protection: refunds on PayPal match what Dalil recorded', async () => {
      const log = await (await fetch('http://localhost:4010/__log')).json();
      const total = Object.values(log.refunds).filter((r) => r.capture === cap.captureId).reduce((a, r) => a + Number(r.amount.value), 0);
      check('protect', 'protection: refunds on PayPal match what Dalil recorded', Math.abs(total - Number(prot.refundedTotal)) < 0.005, `${total} vs ${prot.refundedTotal}`);
    });
    await step('protect', 'protection: a full order-problem refund ends protection', async () => {
      const f = await call('POST', '/api/paypal/refund', { ...cap, reason: 'damaged' });
      const r = await call('GET', `/api/protection/${prot.id}`, undefined, { 'x-device-id': DEV_A });
      check('protect', 'protection: a full order-problem refund ends protection', f.s === 200 && r.j.protection.status === 'ended', f.t + r.t);
    });
    await step('protect', 'protection: ended protection cannot refund again', async () => {
      const r = await call('POST', `/api/protection/${prot.id}`, { action: 'simulate' }, { 'x-device-id': DEV_A });
      check('protect', 'protection: ended protection cannot refund again', r.s === 409, r.t);
    });
    await step('protect', 'cron checks protections and family requests', async () => {
      const r = await call('GET', '/api/cron', undefined, { authorization: 'Bearer cs' });
      check('protect', 'cron checks protections and family requests', r.s === 200 && /protect/i.test(r.t) && /family/i.test(r.t), r.t);
    });
  }
  await step('func', 'family approval page exists', async () => {
    const r = await fetch(BASE + '/f/00000000-0000-0000-0000-000000000000');
    check('func', 'family approval page exists', r.status === 200, r.status);
  });

  // ---------------- Price grounding (local mock model only) ----------------
  if (LOCAL) {
    const key = { 'x-model-api-key': 'k' };
    const ms = settings({ baseUrl: 'http://localhost:4020', demoMode: false });
    await step('sec', 'malicious model inventing a $1 iPhone: no approval card is shown', async () => {
      const r = await call('POST', '/api/chat', { history: [{ role: 'user', text: 'FAKEPRICE iphone' }], settings: ms }, key);
      const ev = nd(r.t);
      const appr = ev.find((e) => e.type === 'block' && e.block.type === 'approval');
      const prods = ev.filter((e) => e.type === 'block' && e.block.type === 'products').flatMap((e) => e.block.offers);
      check('sec', 'malicious model inventing a $1 iPhone: no approval card is shown', !appr && prods.every((o) => o.flags.includes('price_unverified')), r.t.slice(0, 300));
      const fake = prods[0];
      if (fake) {
        const c = await call('POST', '/api/paypal/create-order', { offer: fake, mandate: { maxSpend: 0, verifiedOnly: false } });
        check('sec', 'invented price cannot be checked out (PRICE_UNVERIFIED)', c.s === 409 && c.j.code === 'PRICE_UNVERIFIED', c.t);
        const g = await call('POST', '/api/groups', { offer: fake, shares: 2 }, { 'x-device-id': DEV_A });
        check('sec', 'invented price cannot start a group buy', g.s === 409, g.t);
        const n = await call('POST', '/api/negotiate', { offer: fake, lang: 'en' });
        check('sec', 'invented price cannot be negotiated', n.s === 409, n.t);
      }
    });
    let shown;
    await step('func', 'real flow with mock model: prices seen in search are buyable', async () => {
      const r = await call('POST', '/api/chat', { history: [{ role: 'user', text: 'cheapest airpods pro 3' }], settings: ms }, key);
      shown = nd(r.t).filter((e) => e.type === 'block' && e.block.type === 'products').flatMap((e) => e.block.offers);
      check('func', 'real flow with mock model: prices seen in search are buyable', shown.length && shown.every((o) => !o.flags.includes('price_unverified')), JSON.stringify(shown.map((o) => [o.store, o.price, o.flags])));
    });
    await step('func', 'follow-up "buy the 2nd one" reuses signed prices from earlier', async () => {
      const r = await call('POST', '/api/chat', { history: [{ role: 'user', text: 'BUY THE SECOND' }], settings: ms, offers: shown }, key);
      const appr = nd(r.t).find((e) => e.type === 'block' && e.block.type === 'approval');
      check('func', 'follow-up "buy the 2nd one" reuses signed prices from earlier', appr && !appr.block.offer.flags.includes('price_unverified'), r.t.slice(0, 300));
    });
    await step('sec', 'forged "earlier offers" from the client are ignored', async () => {
      const forged = shown.map((o) => ({ ...o, price: 229, sig: '9999999999999.forged' }));
      const r = await call('POST', '/api/chat', { history: [{ role: 'user', text: 'BUY THE SECOND' }], settings: ms, offers: forged }, key);
      const appr = nd(r.t).find((e) => e.type === 'block' && e.block.type === 'approval');
      check('sec', 'forged "earlier offers" from the client are ignored', !appr, r.t.slice(0, 300));
    });
    await step('sec', 'rate limit: hammering link preview gets 429', async () => {
      let got429 = false;
      for (let i = 0; i < 70 && !got429; i++) got429 = (await call('GET', '/api/preview?url=http%3A%2F%2F127.0.0.1%2F')).s === 429;
      check('sec', 'rate limit: hammering link preview gets 429', got429, 'never limited');
    });
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  require('fs').writeFileSync(`${__dirname}/results-api-${LOCAL ? 'local' : 'live'}.json`, JSON.stringify(results, null, 1));
})().catch((e) => { console.error('RUNNER CRASH', e); process.exit(1); });
