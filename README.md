# Dalil Pi (دليل باي)

AI shopping agent for Pi Network. Tell it what you need; it searches stores that accept Pi **in your country** (detected from your IP, changeable), ranks them without ads, shows Pi prices with the live OKX rate, and sends you to the store's own Pi checkout. English by default, Arabic (RTL) one tap away.

- Design: [`docs/PI_DALIL_DESIGN.md`](docs/PI_DALIL_DESIGN.md)
- Plan, research, costs and pricing: [`docs/PI_DALIL_PLAN.md`](docs/PI_DALIL_PLAN.md)
- Forked from [Dalil (PayPal AI)](https://github.com/medomohamed22/PayPal_Ai) at `904d3d6` — a separate repository; nothing here affects the PayPal site.

## Status — Phase 1 (Testnet)
| Done | |
|---|---|
| ✅ Sign in with Pi (Pi SDK v2, sandbox on Testnet) — access token verified server-side with `GET /v2/me` | |
| ✅ Free plan per Pi account: `FREE_SEARCHES_PER_MONTH` (5) searches/month, counted after a successful search; 10/hour | |
| ✅ Country from IP (`x-vercel-ip-country`) + country picker; the agent only searches stores that sell/ship there | |
| ✅ English default + Arabic switch (RTL) | |
| ✅ Agent searches Pi-accepting stores (Salla Shop Mall, Sallanet Pay stores, Piketplace, Pi Chain Mall, *.pinet.com; Map of Pi only for "near me") | |
| ✅ Cards: Pi price, ≈ USD (OKX), rating, "Accepts Pi" / "Not priced in Pi", evidence line, Open store | |
| ✅ Supabase database: users (Pi uid + username), monthly usage, plans, subscriptions, payments, saved addresses, orders, counters | |
| ✅ My account: plan + usage, saved shipping addresses (one default), order history with status | |
| ✅ "Order" on Pi-priced cards: pick/add an address → order saved (signed offer re-verified) → copy shipping details → pay the store directly | |
| ⏭ Next: trust score 0–100, Salla connector, shipping profile + checkout connectors, paid plans | |

PayPal features from Dalil (holds, refunds, watches, family, group buy, demo tour) were removed.

## Setup
1. **Supabase**: create a project → SQL editor → run the files in [`supabase/migrations`](supabase/migrations) in order (`0001`, `0002`). The free plan limits live in the `plans` table. Copy the project URL and the **service-role** key.
2. **Pi Developer Portal** (open `develop.pi` in the Pi Browser): create a **Testnet** app, set its URL to your Vercel URL, copy the **Server API Key**. To test in a desktop browser, open the app's sandbox link (`https://sandbox.minepi.com/...`) and authorize the sandbox from the Pi app.
3. **Vercel**: create a **new** project from this repository (not the PayPal one) and add the variables from [`.env.example`](.env.example):
   `META_API_KEY`, `PI_API_KEY`, `PI_NETWORK=testnet`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OFFER_SIGNING_SECRET` (new: `openssl rand -hex 32`). Add `NEXT_PUBLIC_PI_SANDBOX=true` (as a config value, not a secret) only if you test through the desktop Pi Sandbox; leave it out to test in the Pi Browser. Tick every environment (Production, Preview, Development) so branch deployments get the variables too.
4. Deploy, then check `GET /api/config` → `ai: true`, `pi.configured: true`, `database: true`.

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in the keys; add ALLOW_DEV_LOGIN=1 to test outside the Pi Browser
npm run dev                   # http://localhost:3000
```
Without Supabase the app falls back to in-memory storage (local testing only).

## Architecture
- `src/app/api/auth/pi` — verifies the Pi access token, upserts the user in Supabase, returns a signed session (sent as `Authorization: Bearer`, because the Pi Sandbox runs the app in an iframe).
- `src/app/api/chat` — checks the session and quota, runs the agent, streams NDJSON, counts the search.
- `src/app/api/me` — user, usage, saved country/language. `src/app/api/config` — country from IP, Pi price, flags.
- `src/lib/server/agent.ts` — Meta tool-calling loop (web search, page fetch, real Chromium) with the Pi-only, country-aware prompt.
- `src/lib/server/rank.ts` — deterministic ranking; Pi-verified store list; non-Pi prices flagged.
- `src/lib/server/{pi,session,users,geo,price,supabase,store}.ts` — Pi API, sessions, quotas, geo, OKX price, database, counters.
- Chats stay on the device (IndexedDB); the server keeps only the Pi account, preferences and usage.

## License
MIT
