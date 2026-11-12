# Dalil Pi — notes for Claude

## Names and places
- Site (production): https://dalilpi.vercel.app (old https://pihackathontest.vercel.app redirects here)
- GitHub: https://github.com/medomohamed22/dalil_pi (renamed from `pi_Hackathon_test`)
- Vercel project: dalil_pi (Hobby, region lhr1). Deployments only from `main` (`vercel.json` turns off `ccr-*` branches).
- Supabase project: DalilPi (`cguxdschojoqbffdrlhm`, eu-west-2). Migrations in `supabase/migrations/`.

## Working rules
- The owner reads Arabic: report in Arabic (Egyptian).
- Pushing to `main` is allowed. Run the tests before pushing.
- Secrets live only in Vercel env vars. Never commit real values, and never ask for them in chat.
- Use only documented/authorized partner APIs (e.g. Salla's partner catalog in `docs/salla-partner/partner-catalog.md`).
- AI is used only in "Ask Dalil" (no AI enrichment of products); AI needs paid credit.
- Ask Dalil is index-first: a plain product request at the start of a chat (`quick.ts` decides) first runs the AI with only `search_dalil_index` + `pick_offers` and a short prompt: 2 AI rounds — keywords, then the refs of the items of the asked kind plus the comment (no re-typing offers). If nothing fits it answers `NO_INDEX_MATCH` (never shown) and the full agent carries on. Photos, links, barcodes, local/services, questions and follow-ups go straight to the full agent.

## After a domain change
- Telegram: `GET /api/telegram/setup` with `Authorization: Bearer $CRON_SECRET` re-registers the webhook.
- Pi Developer Portal: the app URL must match the domain (`public/validation-key.txt`).
- `APP_URL` env var on Vercel, if set, must be the new domain.

## Partner env vars
- Salla Shop: `SALLA_BASE_URL`, `SALLA_PARTNER_ID`, `SALLA_SECRET` (HMAC-signed, hourly pull, ETag).
  - `/catalog`: products of the store + mall merchants; `ships_to` decides the countries, `shipping_by_country` the fee (null = at checkout); `url` already has `?ref=dalilpi` — keep it, never add another.
  - `/services`: Salla apps directory (restaurants, services, health, delivery, mall services, Telegram) → `partner_services` table, `/api/services`, Services tab, and in `search_salla`.
  - Optional `SALLA_COUNTRIES` limits Salla to some countries.

## Load and caching (keep it cheap)
- Public read APIs (search, product, services) are CDN-cached 10 min + stale-while-revalidate; offer signatures last 24 h.
- Rate limit uses the database counter only after half the limit on an instance.
- Catalog pulls write only changed rows (hash); the search index reloads only when `meta.data_at` changes.
- Trust signals / order history / price stats: 5–10 min per-instance cache, cleared on new review, dispute or order status.
- Salla Local (headless browser) is read at most hourly, shared via `kv_cache`; the last list (≤ 1 day) is used if a read fails.
- If the database is down, search keeps the last loaded index; admin password checks fail closed.
- Admin → "الأداء" shows DB calls per instance and writes/reads per table (`admin_db_stats()`).
