# End-to-end tests

The built app runs locally (`next start` on port 3100) against mock servers, so nothing real is
called: the AI model, Pi Platform, stores, Map of Pi, the Salla partner API and Telegram are all
local fakes. The secrets in these files (`cron-test`, `salla-test-secret-…`, …) are test-only values.

```bash
npm ci
npx playwright install chromium   # once (Playwright with Chromium; not a project dependency)
npm run build
npm run test:e2e                  # all files, ~15 min; exit code 1 if any check fails
bash tests/e2e/run.sh e2e20.js    # one file
```

Needs Node 20+, `fuser` (package `psmisc`) and free ports 3100, 4020-4070. Results are in
`tests/e2e/.out/<file>.out` (one `PASS`/`FAIL` line per check) and screenshots in `tests/e2e/.out/shots`.

| File | What it checks |
|---|---|
| `e2e20.js` | Security / abuse: AI credit races, admin auth, token confusion, SSRF, floods, reviews per account, signed store domain, request size |
| `e2e.js` | Sign-in, language/RTL, country from IP, first AI answer with offers |
| `e2e3.js` | Orders: Order button on Pi-priced offers, store product page, addresses |
| `e2e5.js` | Paid plans: Pi payment flow (fake Pi SDK + mock Pi Platform API) |
| `e2e6.js` | Trust score 0–100, breakdown, review quotes, order gating |
| `e2e7.js` | Near me: GPS, distance, directions, Map of Pi link |
| `e2e8.js` | Automatic order at a WooCommerce store that takes Pi |
| `e2e9.js` | How it works, privacy, terms (EN + AR) |
| `e2e10.js` | Partner APIs: Map of Pi, Salla partner catalog (HMAC signature, ETag/304, version) |
| `e2e11.js` | Sort chips, search cache, cron auth |
| `e2e12.js` | UI: tour, detail sheet, compare, twins, follow-ups, retry, offline |
| `e2e13.js` | Preferences, Arabic/English lexicon, watchlist + price-drop alert |
| `e2e14.js` | Merchants: register a shop, appears in search |
| `e2e15.js` | Store check, price history, reviews/disputes, target price, cart, ask the shop, Telegram |
| `e2e16.js` | Dalil Index: catalogs copied by plain code, searched instantly |
| `e2e17.js` | Shop UI: home, search + filters, stores, store page, services |
| `e2e18.js` | AI-credit plans, store traffic + admin, twins, product page, missed searches |
| `e2e19.js` | Owner panel, AI paywall, compact cards |

`mock-*.js` are the fake servers the runner starts for every file.
