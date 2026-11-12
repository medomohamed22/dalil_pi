#!/usr/bin/env bash
# Dalil Pi end-to-end tests: the built app (next start) against local mock servers
# (AI model, Pi Platform, stores, Map of Pi, Salla partner API, Telegram). Nothing real is called.
#
#   npm run build && bash tests/e2e/run.sh            # every test file
#   bash tests/e2e/run.sh e2e20.js                    # one file
#
# Needs: Node 20+, Playwright with Chromium (npx playwright install chromium), fuser (psmisc).
# Results: tests/e2e/.out/<file>.out, screenshots in tests/e2e/.out/shots. Exit code 1 on any FAIL.
set -u
T="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$T/../.." && pwd)"
O="$T/.out"
mkdir -p "$O/shots"
cd "$ROOT"
FAILED=0

run() { # run <free AI searches> <free orders> <file> [extra env]
  pkill -f puppeteer_dev_chrome_profile >/dev/null 2>&1
  fuser -k 3100/tcp 4999/tcp 4062/tcp 4063/tcp 4020/tcp 4030/tcp 4040/tcp 4041/tcp 4060/tcp 4061/tcp 4070/tcp >/dev/null 2>&1
  sleep 1
  for m in mock-meta-pi mock-pi mock-woo mock-partners mock-tg; do (node "$T/$m.js" > "$O/$m.log" 2>&1 &); done
  (env OFFER_SIGNING_SECRET=test-offer-signing-secret-0123456789abcdef ALLOW_DEV_LOGIN=1 CRON_SECRET=cron-test \
    DALIL_TEST_ALLOW_PRIVATE_STORES=1 META_API_KEY=test DALIL_TEST_MODEL_BASE=http://localhost:4020 \
    PI_API_KEY=test-pi-key PI_API_BASE_URL=http://localhost:4030/v2 \
    TELEGRAM_BOT_TOKEN=TEST TELEGRAM_BOT_USERNAME=DalilPiTestBot TELEGRAM_WEBHOOK_SECRET=tg-secret TELEGRAM_API_BASE=http://127.0.0.1:4070/botTEST \
    PCM_API_URL=http://127.0.0.1:4062 GTP_API_URL=http://127.0.0.1:4062 PKT_API_URL=http://127.0.0.1:4062/api/v1 \
    FREE_SEARCHES_PER_MONTH=$1 FREE_ORDERS_PER_MONTH=$2 ${4:-} npx next start -p 3100 > "$O/next.log" 2>&1 &)
  sleep 4
  (cd "$T" && timeout 300 node "$3" "$O/shots" > "$O/$3.out" 2>&1)
  local pass fail
  pass=$(grep -c ^PASS "$O/$3.out"); fail=$(grep -c ^FAIL "$O/$3.out")
  echo "$3: $pass pass, $fail fail"
  grep "^FAIL\|Error" "$O/$3.out" | head -3
  if [ "$fail" != "0" ] || [ "$pass" = "0" ]; then FAILED=1; fi
}

# Mock stores + partner APIs. P2 = the same without the Salla partner API (tests the page-read fallback).
P="DALIL_TEST_SALLA_PRODUCTS_URL=http://127.0.0.1:4063/products DALIL_TEST_SALLA_LOCAL_URL=http://127.0.0.1:4063/local DALIL_TEST_BROWSER_HOST=127.0.0.1:4063 MAPOFPI_API_URL=http://127.0.0.1:4060/api/v1 MAPOFPI_API_KEY=mop-test-key SALLA_BASE_URL=http://127.0.0.1:4061/functions/v1/partner-catalog SALLA_PARTNER_ID=dalil SALLA_SECRET=salla-test-secret-0123456789abcdef"
P2="${P%% SALLA_BASE_URL=*}"

declare -A CFG=(
  [e2e20.js]="1 5 P" [e2e.js]="2 2 -" [e2e3.js]="3 3 -" [e2e5.js]="2 2 -" [e2e6.js]="5 5 -" [e2e7.js]="5 5 -"
  [e2e8.js]="5 5 -" [e2e9.js]="5 5 -" [e2e10.js]="9 5 P" [e2e11.js]="9 5 -" [e2e12.js]="9 5 -" [e2e13.js]="9 5 P"
  [e2e14.js]="9 5 AUTO1" [e2e15.js]="20 9 AUTO1" [e2e16.js]="9 5 P2" [e2e17.js]="9 5 P2" [e2e18.js]="9 5 P2" [e2e19.js]="0 5 P_AUTO0" [e2e21.js]="9 5 P" [e2e22.js]="9 5 P" [e2e23.js]="20 5 P" [e2e24.js]="9 5 P_HARD"
)
ORDER="e2e20.js e2e.js e2e3.js e2e5.js e2e6.js e2e7.js e2e8.js e2e9.js e2e10.js e2e11.js e2e12.js e2e13.js e2e14.js e2e15.js e2e16.js e2e17.js e2e18.js e2e19.js e2e21.js e2e22.js e2e23.js e2e24.js"
for f in ${1:-$ORDER}; do
  read -r s o e <<< "${CFG[$f]}"
  case "$e" in
    P) env_="$P" ;; P2) env_="$P2" ;; AUTO1) env_="MERCHANTS_AUTO_APPROVE=1" ;; P_AUTO0) env_="$P MERCHANTS_AUTO_APPROVE=0" ;; P_HARD) env_="$P DALIL_HARD_DEADLINE_MS=4000" ;; *) env_="" ;;
  esac
  run "$s" "$o" "$f" "$env_"
done
fuser -k 3100/tcp 4999/tcp 4062/tcp 4063/tcp 4020/tcp 4030/tcp 4040/tcp 4041/tcp 4060/tcp 4061/tcp 4070/tcp >/dev/null 2>&1
exit $FAILED
