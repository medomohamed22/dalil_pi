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

## After a domain change
- Telegram: `GET /api/telegram/setup` with `Authorization: Bearer $CRON_SECRET` re-registers the webhook.
- Pi Developer Portal: the app URL must match the domain (`public/validation-key.txt`).
- `APP_URL` env var on Vercel, if set, must be the new domain.

## Partner env vars
- Salla Shop: `SALLA_BASE_URL`, `SALLA_PARTNER_ID`, `SALLA_SECRET` (HMAC-signed, hourly pull, ETag).
