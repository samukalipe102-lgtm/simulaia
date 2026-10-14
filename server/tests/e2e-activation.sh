#!/usr/bin/env bash
# E2E do botão "ATIVAR E TESTAR ENVIO": verificações reais e ativação da IA.
set -uo pipefail
cd "$(dirname "$0")/.."
export DATABASE_FILE=./data/e2e-act.db JWT_SECRET=eact ADMIN_EMAIL=a@b.c ADMIN_PASSWORD=actpass123
export GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= PORT=4360
rm -f data/e2e-act.db data/e2e-act.db-wal data/e2e-act.db-shm
node src/index.js >/tmp/e2e-act.log 2>&1 & PID=$!
trap 'kill $PID 2>/dev/null; rm -f data/e2e-act.db data/e2e-act.db-wal data/e2e-act.db-shm' EXIT
for i in $(seq 1 20); do curl -sf http://127.0.0.1:4360/api/health >/dev/null && break; sleep 0.5; done

B=http://127.0.0.1:4360/api
PASS=0; FAIL=0
check(){ if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }
jqn(){ node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d)'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

T=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"a@b.c","password":"actpass123"}' | jqn ".token")
AUTH="Authorization: Bearer $T"
[ -n "$T" ] && check "login" ok ok || check "login" fail ok

echo "Status de ativação (sem Gmail conectado)"
ST=$(curl -s $B/activation/status -H "$AUTH")
check "não está pronto sem Gmail" "$(echo "$ST" | jqn '.ready')" "false"
check "IA desligada por padrão" "$(echo "$ST" | jqn '.auto_mode')" "false"
check "passo do Gmail pede autenticação" "$(echo "$ST" | jqn '.steps[0].state')" "autenticacao_necessaria"
check "destino = Outlook oficial" "$(echo "$ST" | jqn '.dest')" "admsedugestao@outlook.com"

echo "Ativar sem requisitos → recusa (não liga a IA)"
ACT=$(curl -s -X POST $B/activation/activate -H "$AUTH")
check "ativação recusada (409)" "$(echo "$ACT" | jqn '.activated')" "false"
check "IA continua desligada" "$(curl -s $B/activation/status -H "$AUTH" | jqn '.auto_mode')" "false"

echo "Teste de envio exige e-mail válido e Gmail (falha controlada)"
BADV=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/activation/test-send -H "$AUTH" -H 'Content-Type: application/json' -d '{"to":"invalido"}')
check "e-mail inválido = 400" "$BADV" "400"
TS=$(curl -s -X POST $B/activation/test-send -H "$AUTH" -H 'Content-Type: application/json' -d '{"to":"destino@teste.com"}')
check "teste sem Gmail falha com ok=false" "$(echo "$TS" | jqn '.ok')" "false"

echo "Destino das solicitações segue o e-mail oficial do Outlook"
curl -s -X PUT $B/central/forwarding -H "$AUTH" -H 'Content-Type: application/json' -d '{"official_email":"admsedugestao@outlook.com"}' >/dev/null
check "status reflete destino Outlook" "$(curl -s $B/activation/status -H "$AUTH" | jqn '.dest')" "admsedugestao@outlook.com"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
[ "$FAIL" -eq 0 ]
