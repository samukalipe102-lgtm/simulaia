# Backend: Node.js + Express + agendador (processo always-on)
FROM node:22-slim

WORKDIR /app

# Instala dependências primeiro (melhor cache de camadas)
COPY package*.json ./
RUN npm ci --omit=dev

# Código da aplicação
COPY . .

# Diretório persistente do banco SQLite (monte um volume aqui)
RUN mkdir -p data

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/index.js"]
