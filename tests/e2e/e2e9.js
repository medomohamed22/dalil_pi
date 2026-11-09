// Static pages and onboarding: how it works, privacy, terms (EN + AR).
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByTestId('how').waitFor();
  ok((await p.getByTestId('how').innerText()).includes('Trust score 0–100'), 'How it works on sign-in');
  await p.screenshot({ path: `${OUT}/14-signin.png`, fullPage: true });
  for (const path of ['/privacy', '/terms']) {
    const r = await p.goto('http://localhost:3100' + path);
    const t = await p.locator('main').innerText();
    ok(r.status() === 200 && t.length > 1500 && /[؀-ۿ]/.test(t), `${path} renders (EN + AR)`);
  }
  await p.goto('http://localhost:3100/privacy');
  await p.screenshot({ path: `${OUT}/15-privacy.png` });
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await b.close();
})();
