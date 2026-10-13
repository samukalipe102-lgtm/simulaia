#!/usr/bin/env bash
# E2E HTTP para o modo automático: wizard de setup, toggles de auto-mode e
# autorização de follow-up, estado da automação no dashboard, e endpoint de
# processamento de conversas. (Sem Gmail real — valida a camada HTTP/estado.)
set -uo pipefail
cd "$(dirname "$0")/.."

export DATABASE_FILE=./data/e2e-auto.db
export JWT_SECRET=e2e-auto
export ADMIN_EMAIL=admin@auto.local
export ADMIN_PASSWORD=autopass123
export TEST_MODE=true
export AUTHORIZED_RECIPIENT=
export GOOGLE_CLIENT_ID=
export GOOGLE_CLIENT_SECRET=
export OPENAI_API_KEY=
export PORT=4310

rm -f data/e2e-auto.db data/e2e-auto.db-wal data/e2e-auto.db-shm
node src/index.js >/tmp/e2e-auto.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f data/e2e-auto.db data/e2e-auto.db-wal data/e2e-auto.db-shm' EXIT
for i in $(seq 1 20); do curl -sf http://127.0.0.1:4310/api/health >/dev/null && break; sleep 0.5; done

B=http://127.0.0.1:4310/api
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }
jqn() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d)'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

TOKEN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@auto.local","password":"autopass123"}' | jqn ".token")
AUTH="Authorization: Bearer $TOKEN"
[ -n "$TOKEN" ] && check "login" ok ok || check "login" fail ok

echo "Estado inicial do dashboard"
check "automationState = configuracao_pendente" "$(curl -s $B/reports/dashboard -H "$AUTH" | jqn '.automationState')" "configuracao_pendente"

echo "Wizard de configuração inicial única"
SETUP=$(curl -s -X POST $B/settings/setup -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"authorized_recipient":"authorized@example.com","enabled_categories":["declaracao","historico"],"max_per_day":5,"interval_minutes":30,"auto_mode":true,"auto_followup":false,"poll_interval_minutes":2}')
check "setup marca setup_completed" "$(echo "$SETUP" | jqn '.setup_completed')" "1"
check "setup liga auto_mode" "$(echo "$SETUP" | jqn '.auto_mode')" "1"
check "setup NÃO autoriza follow-up automático (segurança)" "$(echo "$SETUP" | jqn '.auto_followup_approved')" "0"
check "secret do Google não vaza" "$(echo "$SETUP" | jqn ".hasOwnProperty('google_client_secret')?'VAZOU':'ok'")" "ok"

echo "Seeds automáticos (perfis e serviços) sem cadastro manual"
check "serviços criados automaticamente" "$([ "$(curl -s $B/services -H "$AUTH" | jqn '.length')" -ge 1 ] && echo sim || echo nao)" "sim"
check "perfis fictícios criados automaticamente" "$([ "$(curl -s $B/profiles -H "$AUTH" | jqn '.length')" -ge 1 ] && echo sim || echo nao)" "sim"
check "automação principal criada" "$([ "$(curl -s $B/automations -H "$AUTH" | jqn '.length')" -ge 1 ] && echo sim || echo nao)" "sim"

echo "Dashboard após setup (sem Gmail conectado)"
check "automationState = aguardando_gmail" "$(curl -s $B/reports/dashboard -H "$AUTH" | jqn '.automationState')" "aguardando_gmail"
check "dashboard traz bloco de conversas" "$(curl -s $B/reports/dashboard -H "$AUTH" | jqn ".hasOwnProperty('conversations')?'sim':'nao'")" "sim"
check "dashboard traz runtime do agendador" "$(curl -s $B/reports/dashboard -H "$AUTH" | jqn ".runtime&&JSON.parse(d).runtime.hasOwnProperty('startedAt')?'sim':'nao'")" "sim"

echo "Toggles de automação"
check "autorizar follow-up automático" "$(curl -s -X POST $B/settings/approve-auto-followup -H "$AUTH" -H 'Content-Type: application/json' -d '{"approved":true}' | jqn '.auto_followup_approved')" "1"
check "desligar auto-mode" "$(curl -s -X POST $B/settings/auto-mode -H "$AUTH" -H 'Content-Type: application/json' -d '{"enabled":false}' | jqn '.auto_mode')" "0"

echo "Endpoint de processamento de conversas (sem respostas = 0 processadas)"
check "process retorna processed=0" "$(curl -s -X POST $B/requests/process -H "$AUTH" | jqn '.processed')" "0"

echo "Parada de emergência bloqueia o processamento"
curl -s -X POST $B/settings/emergency-stop -H "$AUTH" >/dev/null
check "process bloqueado por emergência" "$(curl -s -X POST $B/requests/process -H "$AUTH" | jqn '.reason')" "emergency_stop"
curl -s -X POST $B/settings/emergency-clear -H "$AUTH" >/dev/null

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
[ "$FAIL" -eq 0 ]
