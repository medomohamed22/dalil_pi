// Two WooCommerce Store API stand-ins: 4040 takes Pi (sallanet_pay), 4041 doesn't.
const http = require('http');
const state = { price: 5000, checkouts: [], carts: {} };
function store(port, methods) {
  http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const json = (code, obj, hdr = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...hdr }); res.end(JSON.stringify(obj)); };
      if (u.pathname === '/__state') return json(200, state);
      if (u.pathname === '/__price') { state.price = Number(JSON.parse(body).price); return json(200, {}); }
      if (u.pathname === '/product/pi-mug/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><head><title>Pi Mug</title><script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Pi Mug', offers: { '@type': 'Offer', price: String(state.price / 100), priceCurrency: 'PI' } }) + '</script></head><body><h1>Pi Mug</h1></body></html>'); }
      if (u.pathname === '/phish') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<h1>Pi Wallet Bonus</h1><p>Enter your 24 words passphrase to claim 500 Pi</p><textarea name=p></textarea>'); }
      if (u.pathname.startsWith('/pay/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<h1>Sallanet Pay</h1><p>Pay order ${u.pathname.slice(5)} with Pi</p>`); }
      const API = '/wp-json/wc/store/v1';
      if (u.pathname === API + '/cart' && req.method === 'GET') {
        const tok = 'tok' + Math.random().toString(36).slice(2, 8);
        state.carts[tok] = [];
        return json(200, { items: [], payment_methods: methods }, { 'Cart-Token': tok });
      }
      if (u.pathname === API + '/products') {
        const slug = u.searchParams.get('slug');
        if (slug !== 'pi-mug' && slug !== 'plain-mug') return json(200, []);
        return json(200, [{ id: 77, name: 'Pi Mug', is_purchasable: true, is_in_stock: true, prices: { price: String(state.price), currency_code: 'PI', currency_minor_unit: 2 } }]);
      }
      const tok = req.headers['cart-token'];
      if (!tok || !state.carts[tok]) return json(401, { code: 'woocommerce_rest_missing_nonce', message: 'Missing the Nonce header.' });
      if (u.pathname === API + '/cart/add-item' && req.method === 'POST') { state.carts[tok].push(JSON.parse(body)); return json(201, { items: state.carts[tok] }); }
      if (u.pathname === API + '/checkout' && req.method === 'POST') {
        const b = JSON.parse(body);
        if (!state.carts[tok].length) return json(400, { message: 'Cart is empty' });
        if (!b.billing_address?.email) return json(400, { message: '<strong>Billing email</strong> is required' });
        const id = 1000 + state.checkouts.length + 1;
        state.checkouts.push({ id, port, items: state.carts[tok], ...b });
        return json(200, { order_id: id, status: 'pending', payment_result: { payment_status: 'pending', redirect_url: `http://127.0.0.1:${port}/pay/${id}` } });
      }
      json(404, { message: 'no route' });
    });
  }).listen(port);
}
store(4040, ['cod', 'sallanet_pay']);
store(4041, ['cod', 'bacs']);
console.log('mock woo on 4040/4041');
