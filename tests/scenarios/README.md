# Scenario & attack tests

See [`TESTING.md`](../../TESTING.md) for the full list and results.

```bash
# 1. stand-ins for PayPal (port 4010) and the Meta model (port 4020)
node tests/scenarios/mock-paypal.js & node tests/scenarios/mock-meta.js &
# 2. local production build pointed at them
npm run build && PORT=3100 DALIL_TEST_MODEL_BASE=http://localhost:4020 \
  PAYPAL_API_BASE=http://localhost:4010 PAYPAL_CLIENT_ID=a PAYPAL_CLIENT_SECRET=b \
  CRON_SECRET=cs OFFER_SIGNING_SECRET=x npx next start -p 3100 &
# 3. run
node tests/scenarios/api100.js                                   # API + attacks (local)
BASE=https://your-deployment.vercel.app node tests/scenarios/api100.js   # same against a deployment
node tests/scenarios/ui100.js                                    # browser scenarios (Playwright)
META_KEY=... BASE=https://your-deployment.vercel.app node tests/scenarios/real.js   # real model runs
```

Credentials are read from environment variables only — never commit them.
