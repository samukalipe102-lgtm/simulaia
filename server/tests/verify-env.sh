#!/usr/bin/env bash
# Validação do .env real: sobe o servidor, loga com as credenciais do admin,
# confirma Gmail configurado e geração da URL OAuth. NÃO conecta o Gmail de
# verdade (isso depende do seu clique de autorização no Google).
set -uo pipefail
cd "$(dirname "$0")/.."

# Usa o .env real, mas em um banco separado para não sujar os dados.
export DATABASE_FILE=./data/verify.db
export PORT=4200
rm -f data/verify.db data/verify.db-wal data/verify.db-shm
node src/db/seed.js >/dev/null 2>&1

PORT=4200 node src/index.js >/tmp/verify-server.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT

for i in $(seq 1 20); do
  curl -sf http://127.0.0.1:4200/api/health >/dev/null && break
  sleep 0.5
done

B=http://127.0.0.1:4200/api
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }
jq_node() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(eval('JSON.parse(d)'+process.argv[1]))}catch(e){console.log('')}})" "$1"; }

echo "Login com as credenciais do admin do .env"
TOKEN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"adminedugestao@gmail.com","password":"12345678"}' | jq_node ".token")
[ -n "$TOKEN" ] && check "login do admin funciona" "ok" "ok" || check "login do admin funciona" "falhou" "ok"
AUTH="Authorization: Bearer $TOKEN"

echo "Gmail reconhecido como configurado"
GST=$(curl -s $B/gmail/status -H "$AUTH")
check "credenciais Google detectadas" "$(echo "$GST" | jq_node '.configured')" "true"
check "ainda não conectado (aguarda sua autorização)" "$(echo "$GST" | jq_node '.connected')" "false"

echo "Geração da URL de consentimento OAuth"
URL=$(curl -s $B/gmail/oauth/url -H "$AUTH" | jq_node ".url")
case "$URL" in
  *accounts.google.com*) check "URL OAuth aponta para o Google" "ok" "ok";;
  *) check "URL OAuth aponta para o Google" "$URL" "ok";;
esac
case "$URL" in
  *696728594519-6hfb7f6pk0hf32f3dcoqv5gck475jusn*) check "URL usa o seu Client ID" "ok" "ok";;
  *) check "URL usa o seu Client ID" "nao-encontrado" "ok";;
esac
case "$URL" in
  *gmail.send*) check "escopo gmail.send presente" "ok" "ok";;
  *) check "escopo gmail.send presente" "nao" "ok";;
esac

echo "Destinatário autorizado configurado"
SET=$(curl -s $B/settings -H "$AUTH")
check "destinatário = adminedugestao@gmail.com" "$(echo "$SET" | jq_node '.authorized_recipient')" "adminedugestao@gmail.com"
check "modo de teste ativo" "$(echo "$SET" | jq_node '.test_mode')" "1"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
rm -f data/verify.db data/verify.db-wal data/verify.db-shm
[ "$FAIL" -eq 0 ]
