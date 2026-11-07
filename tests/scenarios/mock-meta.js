// OpenAI-compatible stand-in for the Meta Model API (chat/completions SSE + responses web_search).
const http = require('http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
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
    const t = Date.now();
    log.push({ path: req.url, t });
    if (req.url === '/__log') { res.end(JSON.stringify(log)); return; }
    if (req.url === '/models') { res.end(JSON.stringify({ data: [{ id: 'muse-spark-1.3-contributor' }, { id: 'muse-spark-1.3' }] })); return; }
    const b = JSON.parse(body || '{}');
    if (req.url === '/responses') {
      await sleep(1200);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output_text: 'Apple | AirPods Pro 3 | $249 | https://www.apple.com/airpods-pro/\nBest Buy | AirPods Pro 3 | $229 | https://www.bestbuy.com/' , output: [] }));
      return;
    }
    if (req.url === '/chat/completions') {
      const toolMsgs = b.messages.filter((m) => m.role === 'tool').length;
      await sleep(600);
      const lastUser = [...b.messages].reverse().find((m) => m.role === 'user');
      const ut = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content ?? '');
      if (ut.includes('FAKEPRICE')) {
        // A malicious / jailbroken model inventing a $1 price.
        if (toolMsgs === 0) return sse(res, [call(0, 'request_purchase_approval', { title: 'iPhone 17 Pro', store: 'Apple', url: 'https://www.apple.com/shop/buy-iphone/iphone-17-pro', price: 1, currency: 'USD', shipping: 0 })]);
        if (toolMsgs === 1) return sse(res, [call(0, 'show_offers', { offers: [{ title: 'iPhone 17 Pro', store: 'Apple', url: 'https://www.apple.com/shop/buy-iphone/iphone-17-pro', price: 2, currency: 'USD', shipping: 0 }] })]);
        return sse(res, [{ content: 'done' }]);
      }
      if (ut.includes('BUY THE SECOND')) {
        // Follow-up turn: buy an offer shown earlier (price grounded by the signed offers the client sends).
        if (toolMsgs === 0) return sse(res, [call(0, 'request_purchase_approval', { title: 'AirPods Pro 3', store: 'Best Buy', url: 'https://www.bestbuy.com/', price: 229, currency: 'USD', shipping: 0 })]);
        return sse(res, [{ content: 'Here you go.' }]);
      }
      if (toolMsgs === 0) return sse(res, [call(0, 'web_search', { queries: ['AirPods Pro 3 price New York', 'AirPods Pro 3 Best Buy Target'] })]);
      if (toolMsgs === 1) return sse(res, [
        call(0, 'browse_url', { url: 'https://www.apple.com/airpods-pro/' }),
        call(1, 'browse_url', { url: 'https://github.com/paypal/AI-Toolkit' }),
        call(2, 'browse_url', { url: 'https://www.bestbuy.com/' }),
      ]);
      if (toolMsgs === 4) return sse(res, [call(0, 'show_offers', { offers: [
        { title: 'AirPods Pro 3', store: 'Apple', url: 'https://www.apple.com/airpods-pro/', price: 249, currency: 'USD', shipping: 0, rating: 4.8, reviewCount: 2100 },
        { title: 'AirPods Pro 3', store: 'Best Buy', url: 'https://www.bestbuy.com/', price: 229, currency: 'USD', shipping: 0, rating: 4.7, reviewCount: 900, distanceKm: 3 },
      ] })]);
      const text = 'Best pick: **Best Buy** at $229 — cheapest, verified, pickup 3 km away.';
      return sse(res, text.match(/.{1,8}/g).map((c) => ({ content: c })));
    }
    res.writeHead(404); res.end('{}');
  });
}).listen(4020, () => console.log('mock meta on 4020'));
