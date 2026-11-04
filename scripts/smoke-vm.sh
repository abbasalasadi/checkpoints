#!/usr/bin/env bash
# VM: start the API on a temp DB in dev mode and run the API smoke test for each language.
set -u
export APP_ENV=dev DEV_LOGIN=true API_PORT=18157 DB_PATH="$PWD/var/smoke/app.db" RUNNER_CONCURRENCY=3
mkdir -p var/smoke
[ -f .env ] || : > .env
[ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null 2>&1
npm run build --workspace server >/dev/null 2>&1
npm run serve --workspace server > var/smoke/server.log 2>&1 &
pid=$!
for i in $(seq 1 30); do curl -sf http://127.0.0.1:18157/healthz >/dev/null && break; sleep 1; done
rc=0
node tools/smoke-api.mjs http://127.0.0.1:18157 go printnbrbase || rc=1
node tools/smoke-api.mjs http://127.0.0.1:18157 js js-perfect-num || rc=1
node tools/smoke-api.mjs http://127.0.0.1:18157 rust rot21 || rc=1
kill "$pid"; wait "$pid" 2>/dev/null
echo "SMOKE_EXIT=$rc"
exit $rc
