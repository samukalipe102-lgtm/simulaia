#!/usr/bin/env bash
# E2E HTTP da central: rotas de processos, caixa, respostas, documentos e
# automação administrativa (config, fila, limites). Sem Gmail real.
set -uo pipefail
cd "$(dirname "$0")/.."
export DATABASE_FILE=./data/e2e-central.db JWT_SECRET=e2ec ADMIN_EMAIL=admin@c.local
export ADMIN_PASSWORD=cpass123 GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= PORT=4340
rm -f data/e2e-central.db data/e2e-central.db-wal data/e2e-central.db-shm
node src/index.js >/tmp/e2e-central.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f data/e2e-central.db data/e2e-central.db-wal data/e2e-central.db-shm' EXIT
for i in $(seq 1 20); do curl -sf http://127.0.0.1:4340/api/health >/dev/null && break; sleep 0.5; done

B=http://127.0.0.1:4340/api
PASS=0; FAIL=0
check(){ if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }
jqn(){ node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d)'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

T=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@c.local","password":"cpass123"}' | jqn ".token")
AUTH="Authorization: Bearer $T"
[ -n "$T" ] && check "login" ok ok || check "login" fail ok

echo "Rotas da central respondem e exigem auth"
check "processos sem token = 401" "$(curl -s -o /dev/null -w '%{http_code}' $B/central/processes)" "401"
check "processos (lista) ok" "$(curl -s -o /dev/null -w '%{http_code}' $B/central/processes -H "$AUTH")" "200"
check "caixa de entrada ok" "$(curl -s -o /dev/null -w '%{http_code}' $B/central/inbox -H "$AUTH")" "200"
check "respostas enviadas ok" "$(curl -s -o /dev/null -w '%{http_code}' $B/central/sent -H "$AUTH")" "200"
check "documentos ok" "$(curl -s -o /dev/null -w '%{http_code}' $B/central/documents -H "$AUTH")" "200"

echo "Automação administrativa (config + fila)"
check "config inicial pausada" "$(curl -s $B/central/admin-automation -H "$AUTH" | jqn '.config.status')" "paused"
UP=$(curl -s -X PUT $B/central/admin-automation -H "$AUTH" -H 'Content-Type: application/json' -d '{"daily_limit":5,"interval_minutes":10,"start_hour":0,"end_hour":24,"allowed_days":"0,1,2,3,4,5,6"}')
check "limite diário salvo" "$(echo "$UP" | jqn '.daily_limit')" "5"
check "intervalo salvo" "$(echo "$UP" | jqn '.interval_minutes')" "10"
check "ativar automação" "$(curl -s -X POST $B/central/admin-automation/activate -H "$AUTH" | jqn '.status')" "active"
ENQ=$(curl -s -X POST $B/central/admin-automation/enqueue -H "$AUTH" -H 'Content-Type: application/json' -d '{"recipient":"admin@c.local","subject":"Aviso","body":"corpo","dedupeKey":"x1"}')
check "enfileirar e-mail administrativo" "$(echo "$ENQ" | jqn '.duplicated')" "false"
ENQ2=$(curl -s -X POST $B/central/admin-automation/enqueue -H "$AUTH" -H 'Content-Type: application/json' -d '{"recipient":"admin@c.local","subject":"Aviso","body":"corpo","dedupeKey":"x1"}')
check "dedupe evita duplicado" "$(echo "$ENQ2" | jqn '.duplicated')" "true"
check "stats mostram 1 pendente" "$(curl -s $B/central/admin-automation -H "$AUTH" | jqn '.stats.counts.pending')" "1"
check "pausar automação" "$(curl -s -X POST $B/central/admin-automation/pause -H "$AUTH" | jqn '.status')" "paused"

echo "Readiness continua disponível"
check "readiness responde" "$(curl -s -o /dev/null -w '%{http_code}' $B/reports/readiness -H "$AUTH")" "200"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
[ "$FAIL" -eq 0 ]
