// OpenAI-compatible stand-in for the Meta Model API, scripted for Dalil Pi tests.
const http = require('http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prompts = [];
let responsesCalls = 0;
let enrichCalls = 0;
function sse(res, chunks) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const c of chunks) res.write(`data: ${JSON.stringify({ choices: [{ delta: c }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}
const call = (i, name, args) => ({ tool_calls: [{ index: i, id: `c${Date.now()}${i}`, function: { name, arguments: JSON.stringify(args) } }] });
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    if (req.url === '/__prompts') { res.end(JSON.stringify(prompts)); return; }
    if (req.url === '/__count') { res.end(JSON.stringify({ responses: responsesCalls, enrich: enrichCalls })); return; }
    const b = JSON.parse(body || '{}');
    if (req.url === '/responses') {
      responsesCalls++;
      await sleep(300);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output_text: 'Pi Mug 50 Pi | Plain Mug 45 Pi\nPi Coffee House | latte | 2 Pi | Fix It phone repair 15 Pi\nSalla Shop Mall | Soundcore Q30 wireless headphones | 480 Pi | https://mall.salla-shop.com/products/q30 | Review: "Great sound and fast delivery to Cairo"\nPiketplace | JBL Tune 520BT | 455 Pi | https://piketplace.com/item/jbl-520\nRandom Shop | Wireless headphones | 1500 EGP | https://random-shop.example/headphones', output: [] }));
      return;
    }
    if (req.url === '/chat/completions') {
      const dev = b.messages.find((m) => m.role === 'developer');
      if (dev && /You tidy product listings/.test(dev.content)) {
        // Enrichment: brand/model/category per product (like the real model would).
        enrichCalls++;
        const items = JSON.parse(b.messages.find((m) => m.role === 'user').content);
        const out = items.map((x) => {
          const t = `${x.title} ${x.title_ar || ''}`;
          if (/spacebuds 2/i.test(t)) return { id: x.id, brand: 'Oraimo', model: 'SpaceBuds 2', category: 'headphones', title_en: 'Oraimo SpaceBuds 2 wireless earbuds', title_ar: 'سماعة أوريمو سبيس بودز 2', keywords: ['earbuds', 'سماعة'] };
          if (/headphones/i.test(t)) return { id: x.id, brand: 'Generic', model: 'wireless', category: 'headphones', title_en: x.title, title_ar: 'سماعة', keywords: ['headphones'] };
          if (/honey|عسل/i.test(t)) return { id: x.id, brand: 'Imtenan', model: null, category: 'grocery', title_en: 'Pure honey', title_ar: 'عسل نحل', keywords: ['honey', 'عسل'] };
          if (/shoe|حذاء|كوتشي/i.test(t)) return { id: x.id, brand: null, model: null, category: 'shoes', title_en: 'Shoes', title_ar: 'حذاء', keywords: ['shoes'] };
          return { id: x.id, brand: null, model: null, category: 'other', title_en: x.title, title_ar: null, keywords: [] };
        });
        out.push({ id: 'not-asked:1', brand: 'Evil', model: 'X1', category: 'phones' });
        return sse(res, [{ content: 'Here you go:\n' + JSON.stringify(out) }]);
      }
      if (dev && !b.messages.some((m) => m.role === 'tool')) prompts.push(dev.content);
      const toolMsgs = b.messages.filter((m) => m.role === 'tool').length;
      await sleep(300);
      const userText = JSON.stringify(b.messages.filter((m) => m.role === 'user').slice(-1));
      if (userText.includes('MERCH')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'dalil_merchants', { query: 'coffee' })]);
        if (toolMsgs === 1) {
          const out = JSON.parse(b.messages.filter((m) => m.role === 'tool')[0].content.replace(/\n\[time left.*$/s, ''));
          const offers = (out.merchants || []).map((mm) => ({ merchantId: mm.merchant_id, title: mm.items[0].title, store: mm.store, url: mm.url, price: mm.items[0].price, currency: 'PI', kind: mm.kind, address: mm.address, lat: mm.lat, lon: mm.lon, phone: mm.phone, piEvidence: mm.piEvidence }));
          if (!offers.length) return sse(res, [{ content: 'No merchants.' }]);
          return sse(res, [call(0, 'show_offers', { offers })]);
        }
        return sse(res, [{ content: 'Merchants shown.' }]);
      }
      if (userText.includes('SALLA1')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'search_salla', { queries: ['سماعة لاسلكية'] })]);
        const tool = (b.messages.filter((m) => m.role === 'tool')[0] || {}).content || '';
        return sse(res, [{ content: `Salla one done. english-match=${tool.includes('Anker Wireless Headphones Q20') ? 'yes' : 'no'}` }]);
      }
      if (userText.includes('FAILME')) { res.writeHead(500); return res.end('{"error":"boom"}'); }
      if (userText.includes('TWIN') || userText.includes('cheaper options')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'web_search', { queries: ['headphones Pi'] })]);
        if (toolMsgs === 1) return sse(res, [call(0, 'show_offers', { offers: [
          { title: 'Soundcore Q30 wireless headphones', store: 'Salla Shop Mall', url: 'https://mall.salla-shop.com/products/q30', price: 480, currency: 'PI', rating: 4.6, reviewCount: 38, kind: 'online', piEvidence: 'Pi SDK checkout' },
          { title: 'Soundcore Q30 headphones wireless', store: 'Piketplace', url: 'https://piketplace.com/item/jbl-520', price: 455, currency: 'PI', rating: 4.4, reviewCount: 12, kind: 'online', piEvidence: 'Listed in Pi' },
          { title: 'JBL Tune 520BT', store: 'Piketplace', url: 'https://piketplace.com/item/jbl-520b', price: 455, currency: 'PI', kind: 'online' },
        ] })]);
        return sse(res, [{ content: 'Twin result.' }]);
      }
      if (userText.includes('IDX')) {
        const q = userText.includes('honey') ? 'عسل' : userText.includes('nothing') ? 'zzqqxx' : 'سماعة';
        if (toolMsgs === 0) return sse(res, [call(0, 'search_dalil_index', { queries: [q] })]);
        const out = JSON.parse(b.messages.filter((m) => m.role === 'tool')[0].content.replace(/\n\[time left.*$/s, ''));
        if (toolMsgs === 1 && out.results.length) {
          const offers = out.results.map((x) => ({ title: x.title, store: x.store, url: x.url, image: x.image, price: x.price, currency: 'PI', listPrice: x.listPrice, inStock: x.inStock, kind: x.kind, piEvidence: x.piEvidence }));
          return sse(res, [call(0, 'show_offers', { offers })]);
        }
        return sse(res, [{ content: 'IDXDONE ' + out.results.length + ' ' + (out.hint || '').slice(0, 60) }]);
      }
      if (userText.includes('GTPSKIP')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'browse_url', { url: 'https://zynmart.pages.dev/' })]);
        const t = b.messages.filter((m) => m.role === 'tool')[0].content;
        return sse(res, [{ content: 'SKIPRESULT ' + t.slice(0, 160) }]);
      }
      if (userText.includes('GTP')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'search_pi_marketplaces', { queries: ['router'] })]);
        if (toolMsgs === 1) {
          const out = JSON.parse(b.messages.filter((m) => m.role === 'tool')[0].content.replace(/\n\[time left.*$/s, ''));
          const offers = (Array.isArray(out) ? out : []).map((x) => ({ title: x.title, store: x.store, url: x.url, image: x.image, price: x.price, currency: 'PI', kind: x.kind, piEvidence: x.piEvidence }));
          return sse(res, [call(0, 'show_offers', { offers })]);
        }
        return sse(res, [{ content: 'GTP done.' }]);
      }
      if (userText.includes('SLOCAL')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'salla_local', { query: userText.includes('pizza') ? 'pizza' : 'كافيه' })]);
        const t = b.messages.filter((m) => m.role === 'tool')[0].content;
        return sse(res, [{ content: 'SLRESULT ' + (t.includes('matched_query":true') ? 'matched' : 'nearest') }]);
      }
      if (userText.includes('PCMBROWSE')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'browse_url', { url: 'https://pipcm.com/#/index' })]);
        const t = b.messages.filter((m) => m.role === 'tool')[0].content;
        return sse(res, [{ content: 'PCMRESULT ' + t.slice(0, 200) }]);
      }
      if (userText.includes('PCM')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'search_pi_chain_mall', { queries: ['shoes'] })]);
        if (toolMsgs === 1) {
          const out = JSON.parse(b.messages.filter((m) => m.role === 'tool')[0].content.replace(/\n\[time left.*$/s, ''));
          const offers = (Array.isArray(out) ? out : []).map((x) => ({ title: x.title, store: x.store, url: x.url, image: x.image, price: x.price, currency: 'PI', kind: 'online', piEvidence: x.piEvidence }));
          offers.push({ title: 'Running shoes', store: 'Piketplace', url: 'https://piketplace.com/item/shoes', price: 250, currency: 'PI', kind: 'online', piEvidence: 'Listed in Pi on Piketplace' });
          return sse(res, [call(0, 'show_offers', { offers })]);
        }
        return sse(res, [{ content: 'Pi Chain Mall first.' }]);
      }
      if (userText.includes('MOPBROWSE')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'browse_url', { url: 'https://mapofpi.com/' })]);
        const t = b.messages.filter((m) => m.role === 'tool')[0].content;
        return sse(res, [{ content: 'RESULT ' + t.slice(0, 200) }]);
      }
      if (userText.includes('MOP')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'map_of_pi', { query: 'coffee' })]);
        if (toolMsgs === 1) {
          const out = JSON.parse(b.messages.filter((m) => m.role === 'tool')[0].content.replace(/\n\[time left.*$/s, ''));
          if (!out.shops) return sse(res, [{ content: 'NO SHOPS ' + JSON.stringify(out).slice(0, 200) }]);
          globalThis.lastLocatedBy = out.located_by;
          const offers = out.shops.map((sh) => ({ title: sh.items[0].title, store: sh.store, url: sh.url, image: sh.items[0].image, price: sh.items[0].price, currency: 'PI', kind: 'local', address: sh.address, lat: sh.lat, lon: sh.lon, distanceKm: sh.distanceKm, rating: sh.rating, piEvidence: sh.piEvidence }));
          return sse(res, [call(0, 'show_offers', { offers })]);
        }
        return sse(res, [{ content: 'Coffee near you (' + globalThis.lastLocatedBy + ').' }]);
      }
      if (userText.includes('WOO')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'web_search', { queries: ['mug pay with Pi'] })]);
        if (toolMsgs === 1) return sse(res, [call(0, 'show_offers', { offers: [
          { title: 'Pi Mug', store: 'Pi Mug Shop', url: 'http://127.0.0.1:4040/product/pi-mug/', price: 50, currency: 'PI', kind: 'online', piEvidence: 'Pay with Pi (Sallanet Pay) at checkout' },
          { title: 'Plain Mug', store: 'Plain Store', url: 'http://127.0.0.1:4041/product/plain-mug/', price: 45, currency: 'PI', kind: 'online' },
        ] })]);
        return sse(res, [{ content: 'Mugs you can buy with Pi.' }]);
      }
      if (userText.includes('LOCAL')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'web_search', { queries: ['shops accept Pi Network Cairo'] })]);
        if (toolMsgs === 1) return sse(res, [call(0, 'show_offers', { offers: [
          { title: 'Pi Coffee House — latte', store: 'Pi Coffee House', price: 2, currency: 'PI', kind: 'local', address: '12 Tahrir St, Downtown Cairo', phone: '+20 100 123 4567', lat: 30.0444, lon: 31.2357, distanceKm: 99, piEvidence: 'Listed on Map of Pi' },
          { title: 'Phone repair', store: 'Fix It', price: 15, currency: 'PI', kind: 'service', phone: 'javascript:alert(1)', piEvidence: 'Accepts Pi' },
        ] })]);
        return sse(res, [{ content: 'Local Pi shops near you.' }]);
      }
      if (userText.includes('SALLA')) {
        if (toolMsgs === 0) return sse(res, [call(0, 'search_salla', { queries: ['headphones', 'سماعة'] })]);
        if (toolMsgs === 1) {
          const out = JSON.parse(b.messages.filter((m) => m.role === 'tool')[0].content.replace(/\n\[time left.*$/s, ''));
          const offers = (Array.isArray(out) ? out : []).slice(0, 4).map((x) => ({ title: x.title, store: x.store, url: x.url, image: 'https://mall.salla-shop.com/og-salla.jpg', price: x.price, currency: 'PI', kind: 'online', piEvidence: x.piEvidence }));
          return sse(res, [call(0, 'show_offers', { offers })]);
        }
        return sse(res, [{ content: 'Best pick from Salla Shop.' }]);
      }
      if (toolMsgs === 0) return sse(res, [call(0, 'web_search', { queries: ['wireless headphones pay with Pi Network Egypt', 'site:mall.salla-shop.com wireless headphones'] })]);
      if (toolMsgs === 1) return sse(res, [call(0, 'show_offers', { offers: [
        { title: 'Soundcore Q30 wireless headphones', store: 'Salla Shop Mall', url: 'https://mall.salla-shop.com/products/q30', price: 480, currency: 'PI', rating: 4.6, reviewCount: 38, kind: 'online', piEvidence: 'Pi price shown; Pi SDK checkout on mall.salla-shop.com', reviews: ['Great sound and fast delivery to Cairo', 'Best headphones ever made, 10/10 would buy again'] },
        { title: 'JBL Tune 520BT', store: 'Piketplace', url: 'https://piketplace.com/item/jbl-520', price: 455, currency: 'PI', rating: 4.4, reviewCount: 12, kind: 'online', piEvidence: 'Listed in Pi on Piketplace' },
        { title: 'Wireless headphones', store: 'Random Shop', url: 'https://random-shop.example/headphones', price: 1500, currency: 'EGP', kind: 'online' },
      ] })]);
      const text = 'Best pick: **JBL Tune 520BT** on Piketplace at 455 Pi. Salla Shop has the Soundcore Q30 at 480 Pi with more reviews.';
      return sse(res, text.match(/.{1,10}/g).map((c) => ({ content: c })));
    }
    res.writeHead(404); res.end('{}');
  });
}).listen(4020, () => console.log('mock meta on 4020'));
