#!/usr/bin/env bash
# Live end-to-end test: boots the real server, drives it via HTTP, tears down.
# Covers auth, AI generation, settings, automation lifecycle, scheduler gating,
# emergency stop, and dashboard — WITHOUT real Gmail (that is validated by the
# mocked gmail-flow.test.js integration test).
set -uo pipefail

cd "$(dirname "$0")/.."
export DATABASE_FILE=./data/e2e.db
export JWT_SECRET=e2e-secret
export ADMIN_EMAIL=admin@e2e.local
export ADMIN_PASSWORD=e2epassword1
export TEST_MODE=true
export AUTHORIZED_RECIPIENT=authorized@example.com
export PORT=4100
# Garante um ambiente determinístico, independente do .env local do desenvolvedor.
export GOOGLE_CLIENT_ID=
export GOOGLE_CLIENT_SECRET=
export OPENAI_API_KEY=

rm -f data/e2e.db data/e2e.db-wal data/e2e.db-shm
node src/db/seed.js >/dev/null 2>&1

node src/index.js >/tmp/e2e-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

# Wait for health.
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:4100/api/health >/dev/null; then break; fi
  sleep 0.5
done

B=http://127.0.0.1:4100/api
PASS=0; FAIL=0
check() { # desc, actual, expected
  if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1));
  else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi
}
jq_node() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);console.log(eval('o'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

echo "1) Autenticação e permissões"
ANON=$(curl -s -o /dev/null -w '%{http_code}' $B/services)
check "rota protegida bloqueia anônimo (401)" "$ANON" "401"
BAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@e2e.local","password":"x"}')
check "login com senha errada (401)" "$BAD" "401"
TOKEN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@e2e.local","password":"e2epassword1"}' | jq_node ".token")
[ -n "$TOKEN" ] && check "login válido retorna token" "ok" "ok" || check "login válido retorna token" "vazio" "ok"
AUTH="Authorization: Bearer $TOKEN"
OK=$(curl -s -o /dev/null -w '%{http_code}' $B/services -H "$AUTH")
check "token válido acessa rota protegida (200)" "$OK" "200"

echo "2) Geração de solicitação (IA)"
# Caminho de simulação (modo real desligado): marca [SIMULAÇÃO] e fictícia.
curl -s -X PUT $B/settings -H "$AUTH" -H 'Content-Type: application/json' -d '{"real_mode":false}' >/dev/null
GEN=$(curl -s -X POST $B/requests/generate -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
FIC=$(echo "$GEN" | jq_node ".fictitious")
check "modo simulação: solicitação marcada como fictícia" "$FIC" "1"
SUBJ=$(echo "$GEN" | jq_node ".subject")
case "$SUBJ" in "[SIMULAÇÃO]"*) check "modo simulação: assunto com [SIMULAÇÃO]" "ok" "ok";; *) check "modo simulação: assunto com [SIMULAÇÃO]" "$SUBJ" "ok";; esac

# Caminho real (modo profissional): sem [SIMULAÇÃO] e não fictícia.
curl -s -X PUT $B/settings -H "$AUTH" -H 'Content-Type: application/json' -d '{"real_mode":true}' >/dev/null
GENR=$(curl -s -X POST $B/requests/generate -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
check "modo real: solicitação NÃO fictícia" "$(echo "$GENR" | jq_node '.fictitious')" "0"
SUBJR=$(echo "$GENR" | jq_node ".subject")
case "$SUBJR" in "[SIMULAÇÃO]"*) check "modo real: assunto SEM [SIMULAÇÃO]" "tem-marcador" "ok";; *) check "modo real: assunto SEM [SIMULAÇÃO]" "ok" "ok";; esac

echo "3) Configurações / modo de teste"
SET=$(curl -s -X PUT $B/settings -H "$AUTH" -H 'Content-Type: application/json' -d '{"test_mode":true,"authorized_recipient":"authorized@example.com"}')
check "modo de teste ativo" "$(echo "$SET" | jq_node ".test_mode")" "1"
check "destinatário autorizado salvo" "$(echo "$SET" | jq_node ".authorized_recipient")" "authorized@example.com"

echo "4) Automação: criar / ativar / pausar / retomar"
AID=$(curl -s -X POST $B/automations -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"E2E","max_per_day":10,"interval_minutes":0,"allowed_days":"0,1,2,3,4,5,6","start_hour":0,"end_hour":24,"max_attempts":2}' | jq_node ".id")
[ -n "$AID" ] && check "automação criada" "ok" "ok" || check "automação criada" "vazio" "ok"
ACT=$(curl -s -X POST $B/automations/$AID/activate -H "$AUTH" | jq_node ".status")
check "automação ativada" "$ACT" "active"
CHK=$(curl -s $B/automations/$AID -H "$AUTH" | jq_node ".check.ok")
check "canSendNow permite envio nas condições abertas" "$CHK" "true"
PAU=$(curl -s -X POST $B/automations/$AID/pause -H "$AUTH" | jq_node ".status")
check "automação pausada" "$PAU" "paused"
RES=$(curl -s -X POST $B/automations/$AID/resume -H "$AUTH" | jq_node ".status")
check "automação retomada" "$RES" "active"

echo "5) Parada de emergência"
ES=$(curl -s -X POST $B/settings/emergency-stop -H "$AUTH" | jq_node ".emergency_stop")
check "parada de emergência aciona flag" "$ES" "1"
CHK2=$(curl -s $B/automations/$AID -H "$AUTH" | jq_node ".check.reason")
check "automações bloqueadas por emergência" "$CHK2" "emergency_stop"
EC=$(curl -s -X POST $B/settings/emergency-clear -H "$AUTH" | jq_node ".emergency_stop")
check "parada de emergência liberada" "$EC" "0"

echo "6) Dashboard / relatórios"
DASH=$(curl -s $B/reports/dashboard -H "$AUTH")
GC=$(echo "$DASH" | jq_node ".gmail.configured")
check "dashboard reporta gmail.configured" "$GC" "false"
TR=$(echo "$DASH" | jq_node ".totals.requests")
[ "$TR" -ge 1 ] && check "dashboard conta solicitações (>=1)" "ok" "ok" || check "dashboard conta solicitações" "$TR" ">=1"
ACTIV=$(curl -s "$B/reports/activity?level=info" -H "$AUTH" | jq_node ".length")
[ "$ACTIV" -ge 1 ] && check "log de atividade persistido" "ok" "ok" || check "log de atividade persistido" "$ACTIV" ">=1"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
[ "$FAIL" -eq 0 ]
