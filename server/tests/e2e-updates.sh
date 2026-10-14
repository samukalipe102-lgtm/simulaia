#!/usr/bin/env bash
# E2E: aba "O que há de novo?" (changelog real), marcação de visto, saúde.
set -uo pipefail
cd "$(dirname "$0")/.."
export DATABASE_FILE=./data/e2e-upd.db JWT_SECRET=eupd ADMIN_EMAIL=a@b.c ADMIN_PASSWORD=updpass123
export GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= PORT=4370
rm -f data/e2e-upd.db data/e2e-upd.db-wal data/e2e-upd.db-shm
node src/index.js >/tmp/e2e-upd.log 2>&1 & PID=$!
trap 'kill $PID 2>/dev/null; rm -f data/e2e-upd.db data/e2e-upd.db-wal data/e2e-upd.db-shm' EXIT
for i in $(seq 1 20); do curl -sf http://127.0.0.1:4370/api/health >/dev/null && break; sleep 0.5; done

B=http://127.0.0.1:4370/api
PASS=0; FAIL=0
check(){ if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }
jqn(){ node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d)'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

T=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"a@b.c","password":"updpass123"}' | jqn ".token")
AUTH="Authorization: Bearer $T"
[ -n "$T" ] && check "login" ok ok || check "login" fail ok

echo "Changelog (O que há de novo?)"
CL=$(curl -s $B/updates/changelog -H "$AUTH")
check "changelog retorna itens" "$([ "$(echo "$CL" | jqn '.items.length')" -ge 1 ] && echo sim || echo nao)" "sim"
check "itens começam como não vistos" "$(echo "$CL" | jqn '.items[0].unseen')" "true"
check "primeiro item tem campo problema" "$(echo "$CL" | jqn '.items[0].problem?"sim":"nao"')" "sim"
check "primeiro item tem campo testes" "$(echo "$CL" | jqn '.items[0].tests?"sim":"nao"')" "sim"

echo "Marcar como visto"
curl -s -X POST $B/updates/changelog/seen -H "$AUTH" >/dev/null
check "após marcar, item não fica mais como novo" "$(curl -s $B/updates/changelog -H "$AUTH" | jqn '.items[0].unseen')" "false"

echo "Saúde do sistema (verificação real)"
H=$(curl -s -X POST $B/updates/health/run -H "$AUTH")
check "health roda e retorna issues" "$(echo "$H" | jqn '.issues?"sim":"nao"')" "sim"
check "sem Gmail → problema de Gmail detectado" "$(echo "$H" | jqn '.issues.map(i=>i.code).join(",").indexOf("gmail")>=0')" "true"

echo "Notificação exige envio real (sem Gmail → falha controlada)"
N=$(curl -s -X POST $B/updates/notify -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
check "notify sem Gmail retorna ok=false" "$(echo "$N" | jqn '.ok')" "false"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
[ "$FAIL" -eq 0 ]
