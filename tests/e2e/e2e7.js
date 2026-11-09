// Near me: GPS from the device, server-measured distance, directions + call, Map of Pi link.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, extraHTTPHeaders: { 'x-vercel-ip-country': 'EG' }, geolocation: { latitude: 30.0626, longitude: 31.2497 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3100/?v=ask', { waitUntil: 'networkidle' });
  await p.getByText('Dev sign-in (local only)').click();
  await p.getByTestId('tour').getByRole('button', { name: 'Skip' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByText('What are you looking for?').waitFor();
  await p.getByRole('radio', { name: 'Near me' }).click();
  ok(await p.getByTestId('mapofpi').isVisible(), 'Map of Pi link shown for Near me');
  ok((await p.getByTestId('mapofpi').getAttribute('href')) === 'https://mapofpi.com', 'Map of Pi link target');
  await p.waitForTimeout(800);
  await p.locator('textarea').fill('LOCAL coffee');
  await p.keyboard.press('Enter');
  await p.getByText('Local Pi shops near you').waitFor({ timeout: 40000 });
  const prompts = await (await fetch('http://127.0.0.1:4020/__prompts')).json();
  ok(prompts.at(-1).includes('GPS 30.0600, 31.2500'), 'GPS sent rounded to ~1 km');
  const cafe = p.locator('[data-offer-card][data-store="Pi Coffee House"]');
  const txt = await cafe.innerText();
  // distance between (30.06,31.25) and (30.0444,31.2357) ≈ 2.2 km; the model's "99" is ignored
  const km = Number((txt.match(/([\d.]+)\s*km/) || [])[1]);
  ok(km > 1.5 && km < 3, `server-measured distance ${km} km (model said 99)`);
  ok(txt.includes('12 Tahrir St'), 'address shown');
  const dir = await cafe.getByRole('link', { name: 'Directions' }).getAttribute('href');
  ok(dir === 'https://www.google.com/maps/dir/?api=1&destination=30.0444%2C31.2357', `directions to exact pin: ${dir}`);
  ok((await cafe.getByRole('link', { name: 'Call' }).getAttribute('href')) === 'tel:+201001234567', 'call link sanitized');
  const fix = p.locator('[data-offer-card][data-store="Fix It"]');
  ok((await fix.getByRole('link', { name: 'Call' }).count()) === 0, 'javascript: phone dropped');
  await cafe.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/12-local.png` });
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
