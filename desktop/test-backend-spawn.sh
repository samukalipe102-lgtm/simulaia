#!/usr/bin/env bash
# Simula o que o main.js do Electron faz: cria uma pasta de dados do usuário com
# .env auto-gerado, sobe o backend apontando DOTENV_PATH/DATABASE_FILE/CLIENT_DIST
# para essa pasta, e valida health + servir o frontend + geração do .env.
# (Testa a LÓGICA de bootstrap sem precisar da GUI do Electron.)
set -uo pipefail
cd "$(dirname "$0")"

PORT=4137
DATA="$(mktemp -d)"
ENVFILE="$DATA/.env"
DBFILE="$DATA/simula.db"
CLIENT_DIST="$(cd ../client && pwd)/dist"
SERVER_DIR="$(cd ../server && pwd)"

# .env auto-gerado (como o ensureEnvFile do main.js)
JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
cat > "$ENVFILE" <<EOF
PORT=$PORT
NODE_ENV=production
CLIENT_ORIGIN=http://127.0.0.1:$PORT
JWT_SECRET=$JWT
JWT_EXPIRES_IN=12h
ADMIN_EMAIL=admin@simulaescola.local
ADMIN_PASSWORD=simula123
TEST_MODE=true
AUTHORIZED_RECIPIENT=
GOOGLE_REDIRECT_URI=http://127.0.0.1:$PORT/api/gmail/oauth/callback
OPENAI_API_KEY=
EOF

DOTENV_PATH="$ENVFILE" DATABASE_FILE="$DBFILE" CLIENT_DIST="$CLIENT_DIST" \
  PORT="$PORT" NODE_ENV=production \
  node "$SERVER_DIR/src/index.js" > /tmp/desktop-backend.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$DATA"' EXIT

for i in $(seq 1 25); do curl -sf http://127.0.0.1:$PORT/api/health >/dev/null && break; sleep 0.4; done

B=http://127.0.0.1:$PORT
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1 (esperado '$3', obtido '$2')"; FAIL=$((FAIL+1)); fi; }

echo "Bootstrap do app desktop"
check "backend sobe e responde /api/health" "$(curl -s -o /dev/null -w '%{http_code}' $B/api/health)" "200"
check "banco criado na pasta de dados do usuário" "$([ -f "$DBFILE" ] && echo sim || echo nao)" "sim"
check "frontend servido pelo backend (#root)" "$(curl -s $B/ | grep -c 'id="root"')" "1"
check "rota SPA cai no index (fallback)" "$(curl -s -o /dev/null -w '%{http_code}' $B/configuracoes)" "200"

echo "Login com o admin padrão do .env auto-gerado"
TOKEN=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@simulaescola.local","password":"simula123"}' \
  | node -pe "try{JSON.parse(require('fs').readFileSync(0)).token||''}catch(e){''}")
[ -n "$TOKEN" ] && check "login funciona" "ok" "ok" || check "login funciona" "falhou" "ok"
AUTH="Authorization: Bearer $TOKEN"

echo "Configuração do Google pela interface (sem editar .env)"
curl -s -X PUT $B/api/settings/google -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"google_client_id":"teste-id.apps.googleusercontent.com","google_client_secret":"GOCSPX-teste"}' >/dev/null
GC=$(curl -s $B/api/reports/dashboard -H "$AUTH" | node -pe "try{JSON.parse(require('fs').readFileSync(0)).gmail.configured}catch(e){'erro'}")
check "após salvar credenciais, gmail.configured = true" "$GC" "true"
SEC=$(curl -s $B/api/settings -H "$AUTH" | node -pe "try{const s=JSON.parse(require('fs').readFileSync(0));('google_client_secret' in s)?'VAZOU':'ok'}catch(e){'erro'}")
check "secret do Google NÃO é exposto ao cliente" "$SEC" "ok"

echo
echo "RESULTADO: $PASS aprovados, $FAIL falhas"
[ "$FAIL" -eq 0 ]
