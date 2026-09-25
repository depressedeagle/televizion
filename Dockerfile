FROM node:22-alpine

WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm install --omit=dev

# Копирование серверного кода
COPY server/ ./server/

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server/index.mjs"]
