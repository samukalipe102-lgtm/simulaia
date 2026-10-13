#!/usr/bin/env bash
# E2E HTTP do EduGestão: importação dos 61 (idempotente), processos, assinaturas,
# identidade institucional e autenticação do SSE.
set -uo pipefail
cd "$(dirname "$0")/.."

export DATABASE_FILE=./data/e2e-edu.db JWT_SECRET=e2e-edu ADMIN_EMAIL=admin@edu.local
export ADMIN_PASSWORD=edupass123 GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= PORT=4330
rm -f data/e2e-edu.db data/e2e-edu.db-wal data/e2e-edu.db-shm
node src/index.js >/tmp/e2e-edu.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f data/e2e-edu.db data/e2e-edu.db-wal data/e2e-edu.db-shm' EXIT
for i in $(seq 1 20); do curl -sf http://127.0.0.1:4330/api/health >/dev/null && break; sleep 0.5; done

B=http://127.0.0.1:4330/api
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }
jqn() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d)'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

TOKEN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@edu.local","password":"edupass123"}' | jqn ".token")
AUTH="Authorization: Bearer $TOKEN"
[ -n "$TOKEN" ] && check "login" ok ok || check "login" fail ok

echo "Processos e assinaturas semeados no boot"
check "processos semeados (>=10)" "$([ "$(curl -s $B/edugestao/processes -H "$AUTH" | jqn '.length')" -ge 10 ] && echo sim || echo nao)" "sim"
check "assinaturas semeadas (>=4)" "$([ "$(curl -s $B/edugestao/signatures -H "$AUTH" | jqn '.length')" -ge 4 ] && echo sim || echo nao)" "sim"

echo "Identidade institucional EduGestão"
check "nome institucional" "$(curl -s $B/edugestao/institution -H "$AUTH" | jqn '.institution_name')" "EduGestão"
check "e-mail institucional" "$(curl -s $B/edugestao/institution -H "$AUTH" | jqn '.institution_email')" "adminedugestao@gmail.com"

echo "Importação dos 61 pares (idempotente)"
IMP=$(curl -s -X POST $B/edugestao/students/import -H "$AUTH")
check "61 alunos inseridos" "$(echo "$IMP" | jqn '.studentsInserted')" "61"
check "total de alunos = 61" "$(curl -s $B/edugestao/students -H "$AUTH" | jqn '.students')" "61"
IMP2=$(curl -s -X POST $B/edugestao/students/import -H "$AUTH")
check "reimportar não duplica (0 novos)" "$(echo "$IMP2" | jqn '.studentsInserted')" "0"
check "reimportar: 61 inalterados" "$(echo "$IMP2" | jqn '.unchanged')" "61"
check "ainda 61 alunos após reimport" "$(curl -s $B/edugestao/students -H "$AUTH" | jqn '.students')" "61"

echo "Segurança do SSE"
check "SSE sem token = 401" "$(curl -s -o /dev/null -w '%{http_code}' $B/events)" "401"

echo "Rotas protegidas exigem auth"
check "students sem token = 401" "$(curl -s -o /dev/null -w '%{http_code}' $B/edugestao/students)" "401"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
[ "$FAIL" -eq 0 ]
