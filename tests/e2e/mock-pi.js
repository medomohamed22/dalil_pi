// Stand-in for the Pi Platform API payments endpoints (Testnet behaviour).
const http = require('http');
const pays = new Map();
const log = [];
let n = 0;
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const u = new URL(req.url, 'http://x');
    log.push(`${req.method} ${u.pathname} ${req.headers.authorization || ''}`);
    if (u.pathname === '/__log') return send(res, 200, log);
    // browser-side helpers used by the fake Pi SDK
    if (u.pathname === '/__create') { const b = JSON.parse(body); const id = `pay_${++n}_${Date.now()}`; pays.set(id, { identifier: id, user_uid: b.uid, amount: b.amount, memo: b.memo, metadata: b.metadata, direction: 'user_to_app', network: 'Pi Testnet', status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false }, transaction: null }); return send(res, 200, { id }); }
    if (u.pathname === '/__sign') { const p = pays.get(JSON.parse(body).id); if (!p.status.developer_approved) return send(res, 400, { error: 'not approved' }); p.transaction = { txid: 'tx_' + p.identifier, verified: true }; p.status.transaction_verified = true; return send(res, 200, { txid: p.transaction.txid }); }
    if (u.pathname === '/__get') { return send(res, 200, pays.get(u.searchParams.get('id')) || null); }
    if (u.pathname === '/__tamper') { const b = JSON.parse(body); pays.get(b.id).amount = b.amount; return send(res, 200, {}); }
    const m = u.pathname.match(/^\/v2\/payments\/([^/]+)(?:\/(approve|complete|cancel))?$/);
    if (m) {
      if (req.headers.authorization !== 'Key test-pi-key') return send(res, 401, { error: 'bad key' });
      const p = pays.get(m[1]);
      if (!p) return send(res, 404, { error: 'not found' });
      if (m[2] === 'approve') p.status.developer_approved = true;
      if (m[2] === 'complete') { if (JSON.parse(body || '{}').txid !== p.transaction?.txid) return send(res, 400, { error: 'txid' }); p.status.developer_completed = true; }
      if (m[2] === 'cancel') p.status.cancelled = true;
      return send(res, 200, p);
    }
    send(res, 404, {});
  });
}).listen(4030, () => console.log('mock pi on 4030'));
