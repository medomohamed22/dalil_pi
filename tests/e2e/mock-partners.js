// Map of Pi (4060, shapes from its open-source app) + Salla partner catalog API (4061).
const http = require('http');
const log = [];
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const sellers = [
  { seller_id: 's1', name: 'Pi Beans Cafe', seller_type: 'activeSeller', isRestricted: false, sell_map_center: { type: 'Point', coordinates: [31.2400, 30.0460] }, trust_meter_rating: 100, image: 'https://img.example/s1.jpg' },
  { seller_id: 's2', name: 'Nile Pi Coffee', seller_type: 'activeSeller', isRestricted: false, sell_map_center: { type: 'Point', coordinates: [31.3000, 30.0800] }, trust_meter_rating: 80 },
  { seller_id: 's3', name: 'Test Shop', seller_type: 'testSeller', isRestricted: false, sell_map_center: { type: 'Point', coordinates: [31.2401, 30.0461] } },
  { seller_id: 's4', name: 'Blocked Shop', seller_type: 'activeSeller', isRestricted: true, sell_map_center: { type: 'Point', coordinates: [31.2402, 30.0462] } },
];
const details = {
  s1: { seller_id: 's1', name: 'Pi Beans Cafe', address: '9 Talaat Harb St, Downtown Cairo', average_rating: { $numberDecimal: '4.7' }, order_online_enabled_pref: true, fulfillment_method: 'Collection by buyer' },
  s2: { seller_id: 's2', name: 'Nile Pi Coffee', address: 'Corniche, Maadi', average_rating: { $numberDecimal: '4.2' }, fulfillment_method: 'Delivered to buyer' },
};
const items = {
  s1: [{ _id: 'i1', name: 'Latte coffee', price: { $numberDecimal: '1.5' }, stock_level: 'Many available', image: 'https://img.example/latte.jpg' }, { _id: 'i2', name: 'Croissant', price: { $numberDecimal: '0.8' }, stock_level: 'Sold' }],
  s2: [{ _id: 'i3', name: 'Turkish coffee', price: { $numberDecimal: '0.9' }, stock_level: 'Many available' }],
};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    log.push(`${req.method} ${req.url} ${req.headers.authorization || ''} ${body}`);
    if (req.url === '/__log') return json(res, 200, log);
    if (req.method === 'POST' && req.url === '/api/v1/sellers/fetch') {
      const b = JSON.parse(body || '{}').bounds || {};
      const inside = sellers.filter((s) => { const [lng, lat] = s.sell_map_center.coordinates; return lat >= b.sw_lat && lat <= b.ne_lat && lng >= b.sw_lng && lng <= b.ne_lng; });
      return json(res, 200, inside);
    }
    let m = req.url.match(/^\/api\/v1\/sellers\/item\/(\w+)$/);
    if (m) return json(res, 200, items[m[1]] || []);
    m = req.url.match(/^\/api\/v1\/sellers\/(\w+)$/);
    if (m) return details[m[1]] ? json(res, 200, details[m[1]]) : json(res, 404, {});
    json(res, 404, {});
  });
}).listen(4060);
// Salla Shop partner catalog API — the real contract (docs/salla-partner/partner-catalog.md), with
// the same checks: HMAC-SHA256 signature, 5-minute clock window, one-time nonce, ETag/304, version.
const crypto = require('crypto');
const SALLA_SECRET = 'salla-test-secret-0123456789abcdef', SALLA_PARTNER = 'dalil';
const nonces = new Set();
let sallaVersion = 'v1';
const R = '?ref=dalilpi';
const sallaProducts = [
  { id: 'aaaaaaaa-1111-4111-8111-000000000001', title: 'Anker Wireless Headphones Q20', title_ar: null, description: 'ANC', url: 'https://mall.salla-shop.com/product/aaaaaaaa-1111-4111-8111-000000000001' + R, image: 'https://cdn.salla.example/q20.jpg', images: ['https://cdn.salla.example/q20.jpg'], price: 420.5, list_price: 480, currency: 'PI', in_stock: true, category: 'Mobile accessories', category_ar: 'اكسسوارات موبايل', tags: [], source: 'salla', seller: null, ships_to: ['EG', 'SA', 'AE', 'US', 'NG', 'FR', 'VN'], shipping_by_country: { EG: 0.8123, SA: 0.8123, AE: 0.8123, US: 0.8123, NG: 0.8123, FR: 0.8123, VN: 0.8123 } },
  // An older row without ships_to (reaches everywhere, like the page read).
  { id: 'aaaaaaaa-1111-4111-8111-000000000002', title: 'Soundcore Life headphones', title_ar: 'سماعة ساوندكور', url: 'https://mall.salla-shop.com/product/aaaaaaaa-1111-4111-8111-000000000002' + R, image: 'https://cdn.salla.example/life.jpg', price: 380, currency: 'PI', in_stock: true, category: 'Mobile accessories', tags: [] },
  { id: 'aaaaaaaa-1111-4111-8111-000000000003', title: 'evil headphones', url: 'javascript:alert(1)', price: 1, currency: 'PI', in_stock: true },
  { id: 'aaaaaaaa-1111-4111-8111-000000000004', title: 'evil2 headphones', url: 'https://evil.example/product/x', price: 1, currency: 'PI', in_stock: true },
  // A link to ANOTHER product than its id → dropped.
  { id: 'aaaaaaaa-1111-4111-8111-000000000006', title: 'evil3 headphones', url: 'https://mall.salla-shop.com/product/aaaaaaaa-1111-4111-8111-000000000001' + R, price: 1, currency: 'PI', in_stock: true },
  // A mall merchant's product: Egypt only, shipping worked out at checkout.
  { id: 'aaaaaaaa-1111-4111-8111-000000000005', title: 'Merchant Earbuds X1', title_ar: 'سماعة تاجر', url: 'https://mall.salla-shop.com/merchant-product/aaaaaaaa-1111-4111-8111-000000000005' + R, image: 'https://cdn.salla.example/x1.jpg', price: 150, currency: 'PI', in_stock: true, category: 'Mobile accessories', tags: [], source: 'merchant', seller: 'Cairo Gadgets', ships_to: ['EG'], shipping_by_country: { EG: null } },
  // Saudi-only product with free shipping.
  { id: 'aaaaaaaa-1111-4111-8111-000000000007', title: 'Saudi Dates Box', url: 'https://mall.salla-shop.com/product/aaaaaaaa-1111-4111-8111-000000000007' + R, price: 12, currency: 'PI', in_stock: true, category: 'Food', tags: [], source: 'salla', seller: null, ships_to: ['SA'], shipping_by_country: { SA: 0 } },
];
let servicesVersion = 's1';
const sallaServices = [
  { id: 'cb5eac39-0000-4000-8000-000000000001', type: 'restaurant', name: 'Kebab House', name_ar: 'بيت الكباب', image: 'https://cdn.salla.example/kebab.jpg', countries: ['EG'], city: 'Cairo', category: 'grills', specialty: null, provider: null, price: null, price_unit: null, currency: 'PI', rating: 4.6, ratings: 31, url: 'https://mall.salla-shop.com/restaurants/r/cb5eac39-0000-4000-8000-000000000001' + R },
  { id: 'hh-1', type: 'health', name: 'Nile Lab', name_ar: 'معمل النيل', image: null, countries: ['EG'], city: 'Giza', category: 'lab', specialty: 'Blood tests', provider: null, price: 3.5, price_unit: 'visit', currency: 'PI', rating: 4.9, ratings: 8, url: 'https://mall.salla-shop.com/care/p/hh-1' + R },
  { id: 'tg-stars', type: 'telegram', name: 'Telegram Stars', name_ar: 'نجوم تليجرام', image: 'https://cdn.salla.example/stars.png', countries: [], city: null, category: null, specialty: null, provider: 'Salla Shop', price: 0.42, price_unit: '50_stars', currency: 'PI', rating: null, ratings: null, url: 'https://mall.salla-shop.com/telegram/stars' + R },
  { id: 'cairo', type: 'delivery', name: 'Salla Go Cairo', name_ar: 'سلة جو القاهرة', image: null, countries: ['EG'], city: 'Cairo', category: 'delivery', price: null, currency: 'PI', url: 'https://go.salla-shop.com/' + R },
  { id: 'evil', type: 'service', name: 'Evil service', countries: [], url: 'https://evil.example/x', currency: 'PI' },
  { id: 'evil2', type: 'hack', name: 'Bad type', countries: [], url: 'https://mall.salla-shop.com/x', currency: 'PI' },
];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const h = req.headers;
  const pq = req.url.replace(/^\/functions\/v1/, '');
  const canonical = [req.method, pq, h['x-timestamp'], h['x-nonce'], crypto.createHash('sha256').update('').digest('hex')].join('\n');
  const want = crypto.createHmac('sha256', SALLA_SECRET).update(canonical).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(h['x-timestamp'])) <= 300;
  const nonceOk = /^[0-9a-f]{16,64}$/.test(h['x-nonce'] || '') && !nonces.has(h['x-nonce']);
  const sigOk = h['x-partner-id'] === SALLA_PARTNER && fresh && nonceOk && typeof h['x-signature'] === 'string' && h['x-signature'] === want;
  log.push(`SALLA ${req.method} ${req.url} sig=${sigOk ? 'ok' : 'bad'} inm=${h['if-none-match'] || ''} auth=${h.authorization ? 'present' : 'none'}`);
  if (u.pathname === '/__salla/version') { sallaVersion = 'v' + Date.now(); return json(res, 200, { version: sallaVersion }); }
  if (u.pathname === '/__salla/services-version') { servicesVersion = 's' + Date.now(); return json(res, 200, { version: servicesVersion }); }
  if (u.pathname === '/__salla/price') { const it = sallaProducts.find((x) => x.id === u.searchParams.get('id')); if (it) it.price = Number(u.searchParams.get('price')); sallaVersion = 'v' + Date.now(); return json(res, 200, { ok: !!it, version: sallaVersion }); }
  if (req.method !== 'GET') return json(res, 405, { error: 'method' });
  if (!sigOk) return json(res, 401, { error: 'bad signature' });
  nonces.add(h['x-nonce']);
  if (u.pathname === '/functions/v1/partner-catalog/health') return json(res, 200, { ok: true, partner: SALLA_PARTNER });
  if (u.pathname === '/functions/v1/partner-catalog/catalog') {
    const etag = `"${sallaVersion}"`;
    if (h['if-none-match'] === etag) { res.writeHead(304, { etag }); return res.end(); }
    const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit')) || 200));
    const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    const rows = sallaProducts.slice((page - 1) * limit, page * limit);
    res.setHeader('etag', etag);
    return json(res, 200, { products: rows, page, limit, total: sallaProducts.length, pages: Math.ceil(sallaProducts.length / limit), version: sallaVersion, updated_at: new Date().toISOString() });
  }
  if (u.pathname === '/functions/v1/partner-catalog/services') {
    const type = u.searchParams.get('type');
    if (type && !['restaurant', 'service', 'health', 'delivery', 'mall_service', 'telegram'].includes(type)) return json(res, 400, { error: 'bad_type' });
    const etag = `"${servicesVersion}"`;
    if (h['if-none-match'] === etag) { res.writeHead(304, { etag }); return res.end(); }
    const all = sallaServices.filter((x) => !type || x.type === type);
    const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit')) || 200));
    const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    res.setHeader('etag', etag);
    return json(res, 200, { services: all.slice((page - 1) * limit, page * limit), page, limit, total: all.length, pages: Math.ceil(all.length / limit), version: servicesVersion, updated_at: new Date().toISOString() });
  }
  json(res, 404, { error: 'unknown path' });
}).listen(4061);
// Pi Chain Mall: case-sensitive like the real one
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  log.push(`PCM ${req.url}`);
  if (u.pathname === '/api/v1/index-loading') {
    // Piketplace: pages of 2, filtered by country like the real one; a big "countries" blob rides along
    const iso = u.searchParams.get('filter[iso2]');
    const page = Number(u.searchParams.get('page') || 1);
    log.push(`PKT c=${iso} p=${page}`);
    const img = (n) => [{ lien: `https://mainnet-backend.piketplace.com/storage/uploads/images/x/${n}.jpg` }];
    const all = [
      { id: 501, libelle: 'حذاء رجالي جلد', description: 'leather shoes', price: 484.16, quantity: 3, status: 'validated', is_digital: false, free_shipping: true, imageFirst: 'https://mainnet-backend.piketplace.com/storage/uploads/images/x/501.jpg', images: img(501), country_code: 'EG', shipping_zone: [], shippingCountries: [], freeShippingCountries: ['EG'], user: { shopNameShow: 'Cairo Shoes' } },
      { id: 502, libelle: 'Wireless Headphones Max', description: 'bluetooth', price: 300, quantity: 5, status: 'validated', is_digital: false, imageFirst: 'https://mainnet-backend.piketplace.com/storage/uploads/images/x/502.jpg', images: img(502), country_code: 'EG', shipping_zone: [{ country_code: 'EG', fee_pi: 12.5 }], shippingCountries: ['EG'], freeShippingCountries: [], user: { shopNameShow: 'Pi Audio EG' } },
      { id: 503, libelle: 'Lagos only headphones', price: 100, quantity: 1, status: 'validated', imageFirst: null, images: [], country_code: 'NG', shipping_zone: [{ country_code: 'NG', fee_pi: 5 }], shippingCountries: ['NG'], freeShippingCountries: [], user: { shopNameShow: 'Naija' } },
      { id: 504, libelle: 'ملابس اطفال', price: 0.0000014, quantity: 9, status: 'validated', images: [], country_code: 'EG', shipping_zone: [], shippingCountries: [], freeShippingCountries: [], user: {} },
      { id: 506, libelle: 'oraimo SpaceBuds 2 earbuds', description: 'original', price: 690, quantity: 4, status: 'validated', imageFirst: 'https://mainnet-backend.piketplace.com/storage/uploads/images/x/506.jpg', images: img(506), country_code: 'EG', shipping_zone: [{ country_code: 'EG', fee_pi: 10 }], shippingCountries: ['EG'], freeShippingCountries: [], user: { shopNameShow: 'Buds EG' } },
      { id: 505, libelle: 'كوتشي جيب', price: 262.83, quantity: 2, status: 'validated', is_digital: true, images: [], country_code: 'EG', shipping_zone: [], shippingCountries: [], freeShippingCountries: [], user: { shopNameShow: 'Kicks' } },
    ];
    const rows = all.filter((x) => iso === 'NG' ? x.country_code === 'NG' : x.country_code === 'EG' || x.shippingCountries.includes(iso));
    const per = 2, last = Math.max(1, Math.ceil(rows.length / per));
    return json(res, 200, { products: { current_page: page, last_page: last, per_page: per, total: rows.length, data: rows.slice((page - 1) * per, page * per) }, countries: Array.from({ length: 50 }, (_, i) => ({ id: i, name: 'Country ' + i })) });
  }
  if (u.pathname === '/api/products') {
    log.push(`GTP ${req.url}`);
    const q = (u.searchParams.get('search') || '').toLowerCase();
    const all = [
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaa1', title: 'MTN 5G ROUTER', price: 340, country: 'Nigeria', images: ['https://ik.imagekit.io/x/r.jpg'], stock: 3, status: 'active', productType: 'physical', sellerUsername: 'naija' },
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaa2', title: 'Router setup guide (e-book)', price: 2, country: 'United States of America', images: [], stock: 99, status: 'active', productType: 'digital', sellerUsername: 'zw' },
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaa3', title: 'Cairo router', price: 120, country: 'Egypt', images: [], stock: 1, status: 'active', productType: 'physical', sellerUsername: 'cairo' },
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaa4', title: 'Router auction', price: 5, country: 'Egypt', status: 'active', productType: 'physical', sellingType: 'auction' },
      { _id: 'bad', title: 'router bad id', price: 5, country: 'Egypt', status: 'active' },
    ];
    return json(res, 200, { success: true, pagination: { page: 1, totalPages: 1 }, products: all.filter((x) => x.title.toLowerCase().includes(q)) });
  }
  if (u.pathname !== '/api/commodity/commodity/getCommodityList') return json(res, 404, {});
  const q = u.searchParams.get('search') || '';
  const cid = u.searchParams.get('countryId') || 'globle8787';
  const mark = u.searchParams.get('commdityMark') || '-1';
  // like the real one: every listing sits under one sales country; commdityMark 1 = global sale
  const all = [
    { id: 'aaa111', userId: 'u1', title: 'Sports Shoes Runner', price: 258, status: 0, commdityMark: 1, cid: '235', urlList: ['2026/2/9/shoe.webp'], tUserEntity: { nickName: 'VIPIN PI STORE' } },
    { id: 'bbb222', userId: 'u2', title: 'Hidden Shoes', price: 99, status: 1, commdityMark: 0, cid: '17', urlList: [] },
    { id: 'ccc333', userId: 'u3', title: 'Free Shoes', price: 0, status: 0, commdityMark: 0, cid: '17', urlList: [] },
    { id: 'ddd444', userId: 'u4', title: 'Bluetooth Headphones Pro', price: 150, status: 0, commdityMark: 0, cid: '17', urlList: ['2026/1/1/hp.webp', '2026/1/1/hp2.webp'], tUserEntity: { nickName: 'PCM AUDIO' } },
    { id: 'eee555', userId: 'u5', title: 'India Only Shoes', price: 120, status: 0, commdityMark: 0, cid: '235', urlList: [], tUserEntity: { nickName: 'Prabhu' } },
    { id: 'fff666', userId: 'u6', title: 'Skullcandy Headphones India', price: 200, status: 0, commdityMark: 0, cid: '235', urlList: [], tUserEntity: { nickName: 'Prabhu' } },
  ];
  log.push(`PCM ${q ? 'search' : 'list'} c=${cid} m=${mark} ${q}`);
  const rows = all
    .filter((x) => cid === 'globle8787' || x.cid === cid)
    .filter((x) => mark === '-1' || String(x.commdityMark) === mark)
    .filter((x) => x.title.includes(q))
    .map(({ cid: _c, ...x }) => x);
  json(res, 200, { code: '0000', totalPage: 1, totalNumber: rows.length, object: rows });
}).listen(4062);
// Salla Local page: loads its shop list like the real one (POST rpc/get_public_offline_merchants)
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/local') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><body><div id=list>loading</div><script>fetch('/rest/v1/rpc/get_public_offline_merchants',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json()).then(j=>{document.getElementById('list').textContent=j.length+' shops'})</script></body>`);
  }
  if (u.pathname === '/products') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><body><div id=p>loading</div><script>
      fetch('/rest/v1/store_settings?select=pi_price_cache&limit=1').then(r=>r.json());
      fetch('/rest/v1/store_settings?select=*&limit=1').then(r=>r.json());
      fetch('/rest/v1/products?select=id,name&is_featured=eq.true').then(r=>r.json());
      fetch('/rest/v1/products?select=id,name,name_ar,price,local_price_egp&in_stock=eq.true').then(r=>r.json()).then(j=>{document.getElementById('p').textContent=j.length})
    </script></body>`);
  }
  if (u.pathname === '/rest/v1/store_settings') {
    log.push('SPAGE settings');
    if ((u.searchParams.get('select') || '') === '*') return json(res, 200, [{ usd_rate: 51, profit_percentage: 6, pi_price_cache: 0.07282, admin_whatsapp: 'x' }]);
    return json(res, 200, [{ pi_price_cache: 0.07282 }]);
  }
  if (u.pathname === '/rest/v1/products') {
    log.push(`SPAGE products ${u.search.slice(0, 40)}`);
    if (u.searchParams.get('is_featured')) return json(res, 200, [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'featured' }]);
    return json(res, 200, [
      { id: 'd17b7bcd-6fa7-4e40-a24a-6f0ba81fdc78', name: 'oraimo SpaceBuds 2 AI Smart Wireless Earbuds', name_ar: 'oraimo SpaceBuds 2 سماعات لاسلكية ذكية', description: 'Bluetooth 6.0, ANC', description_ar: 'بلوتوث', price: 0, local_price_egp: 2700, original_price: 3000, image: 'https://cdn.salla.example/spacebuds.webp', category: 'اكسسوارات موبايل', categories: { name: 'Mobile accessories' }, in_stock: true, stock_quantity: 2, tags: ['سماعات'] },
      { id: 'ef7d0640-28fe-4f38-9512-0cc1b5c84ebe', name: 'Pure honey from Imtenan, 800 grams', name_ar: 'عسل نحل امتنان ٨٠٠ جرام', price: 0, local_price_egp: 1300, image: 'https://cdn.salla.example/honey.webp', in_stock: true, stock_quantity: 5, tags: [] },
      { id: 'bad-id', name: 'bad', local_price_egp: 10 },
      { id: 'aaaaaaaa-0000-4000-8000-000000000009', name: 'No price', local_price_egp: 0 },
    ]);
  }
  if (u.pathname === '/rest/v1/rpc/get_public_offline_merchants') {
    log.push('SLOCAL rpc');
    return json(res, 200, [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Far Natural Shop', description: 'منتجات طبيعيه 100%', image_url: 'https://cdn.salla.example/far.jpg', latitude: 29.42, longitude: 30.85, address: 'الفيوم', country: 'EG', phone: '010', whatsapp: '01555583282', status: 'active' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Downtown PlayStation & Cafe', description: 'PlayStation & Cafe', image_url: 'https://cdn.salla.example/l2.jpg', latitude: 30.05, longitude: 31.24, address: '2 Talaat Harb St, Cairo', country: 'EG', phone: '+20 100 222 3333', whatsapp: 'https://wa.me/201212312057', status: 'active' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Riyadh Shop', latitude: 24.7, longitude: 46.7, country: 'SA', status: 'active' },
      { id: '44444444-4444-4444-8444-444444444444', name: 'Closed Shop', latitude: 30.04, longitude: 31.23, country: 'EG', status: 'suspended' },
      { id: 'not-a-uuid', name: 'Bad', country: 'EG' },
    ]);
  }
  json(res, 404, {});
}).listen(4063);
console.log('mock partners on 4060/4061/4062/4063');
