#!/usr/bin/env bash
# Setup fácil do Simula Escola IA.
# Cria o server/.env com um JWT_SECRET forte gerado automaticamente e pergunta
# apenas o essencial. Pode rodar sem argumentos (modo interativo).
#
# Uso:
#   bash setup.sh
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE="server/.env"
EXAMPLE="server/.env.example"

echo "============================================"
echo "  Simula Escola IA — configuração rápida"
echo "============================================"
echo

if [ -f "$ENV_FILE" ]; then
  read -r -p "Já existe server/.env. Sobrescrever? (s/N) " ans
  case "${ans:-N}" in
    s|S) ;;
    *) echo "Mantido o .env atual. Nada alterado."; exit 0 ;;
  esac
fi

# Gera um JWT_SECRET forte automaticamente.
JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

read -r -p "E-mail do administrador [admin@simulaescola.local]: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@simulaescola.local}

read -r -s -p "Senha do administrador (mín. 8): " ADMIN_PASSWORD; echo
while [ ${#ADMIN_PASSWORD} -lt 8 ]; do
  read -r -s -p "Senha muito curta. Tente de novo (mín. 8): " ADMIN_PASSWORD; echo
done

read -r -p "Seu Gmail autorizado para testes (ex.: voce@gmail.com): " RECIPIENT

echo
echo "Credenciais do Google (OAuth) são opcionais agora — você pode preencher"
echo "depois. Deixe em branco para configurar mais tarde."
read -r -p "GOOGLE_CLIENT_ID (opcional): " GCID
read -r -p "GOOGLE_CLIENT_SECRET (opcional): " GCSECRET

# Monta o .env a partir do exemplo, substituindo os valores.
cp "$EXAMPLE" "$ENV_FILE"

set_val() { # chave valor
  local key="$1" val="$2"
  # escapa & e / para o sed
  val=$(printf '%s' "$val" | sed -e 's/[&/\]/\\&/g')
  sed -i.bak "s/^${key}=.*/${key}=${val}/" "$ENV_FILE"
}

set_val JWT_SECRET "$JWT"
set_val ADMIN_EMAIL "$ADMIN_EMAIL"
set_val ADMIN_PASSWORD "$ADMIN_PASSWORD"
set_val AUTHORIZED_RECIPIENT "$RECIPIENT"
set_val TEST_MODE "true"
[ -n "$GCID" ] && set_val GOOGLE_CLIENT_ID "$GCID"
[ -n "$GCSECRET" ] && set_val GOOGLE_CLIENT_SECRET "$GCSECRET"
rm -f "${ENV_FILE}.bak"

echo
echo "✅ server/.env criado com JWT_SECRET forte gerado automaticamente."
echo
echo "Próximos passos:"
echo "  1) Opção Docker (recomendado):  docker compose up -d --build"
echo "     e acesse http://localhost:8080"
echo
echo "  2) Opção manual:"
echo "     cd server && npm install && npm run seed && npm start"
echo "     cd client && npm install && npm run dev   (em outro terminal)"
echo
echo "Depois, no app: Configurações → confira o modo de teste e o destinatário;"
echo "Integração com Gmail → conecte sua conta (precisa das credenciais Google)."
