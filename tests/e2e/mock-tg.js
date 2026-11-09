// Telegram Bot API stand-in on 4070: records sendMessage calls.
const http = require('http');
const sent = [];
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/__sent') return res.end(JSON.stringify(sent));
    const b = JSON.parse(body || '{}');
    if (req.url.endsWith('/sendMessage')) sent.push(b);
    res.end(JSON.stringify({ ok: true, result: true }));
  });
}).listen(4070, () => console.log('mock tg 4070'));
