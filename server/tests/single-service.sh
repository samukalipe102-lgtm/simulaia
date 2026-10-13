#!/usr/bin/env bash
# Valida o modo de serviço único (produção): o backend serve a API E o frontend
# buildado (SPA fallback). Simula o que o Render fará.
set -uo pipefail
cd "$(dirname "$0")/.."

export DATABASE_FILE=./data/single.db
export PORT=4250
export NODE_ENV=production
export CLIENT_DIST="$(cd ../client && pwd)/dist"
export JWT_SECRET=singletest
export ADMIN_EMAIL=a@b.c
export ADMIN_PASSWORD=singlepass1
export TEST_MODE=true
export AUTHORIZED_RECIPIENT=me@gmail.com
export GOOGLE_CLIENT_ID=
export GOOGLE_CLIENT_SECRET=
export OPENAI_API_KEY=

rm -f data/single.db data/single.db-wal data/single.db-shm
node src/db/seed.js >/dev/null 2>&1

node src/index.js >/tmp/single-server.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT

for i in $(seq 1 20); do curl -sf http://127.0.0.1:4250/api/health >/dev/null && break; sleep 0.5; done

B=http://127.0.0.1:4250
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }

echo "Backend serve a API"
HC=$(curl -s -o /dev/null -w '%{http_code}' $B/api/health)
check "GET /api/health = 200" "$HC" "200"

echo "Backend serve o frontend (SPA)"
ROOT=$(curl -s $B/ | grep -c "<div id=\"root\">")
check "/ retorna index.html com #root" "$ROOT" "1"
# Rota do cliente deve cair no index.html (fallback SPA), não 404
SPA=$(curl -s -o /dev/null -w '%{http_code}' $B/automacoes)
check "rota SPA /automacoes = 200 (fallback)" "$SPA" "200"
# Asset estático existe
ASSET=$(curl -s $B/ | grep -oE '/assets/[^"]+\.js' | head -1)
if [ -n "$ASSET" ]; then
  AC=$(curl -s -o /dev/null -w '%{http_code}' "$B$ASSET")
  check "asset JS servido ($ASSET)" "$AC" "200"
else
  check "asset JS referenciado no index" "nao" "sim"
fi

echo "API 404 continua JSON (não cai no SPA)"
J=$(curl -s $B/api/rota-inexistente | node -pe "try{JSON.parse(require('fs').readFileSync(0)).error?'json':'outro'}catch(e){'nao-json'}")
check "/api/rota-inexistente responde JSON de erro" "$J" "json"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
rm -f data/single.db data/single.db-wal data/single.db-shm
[ "$FAIL" -eq 0 ]
