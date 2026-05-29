FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Render injects PORT automatically at runtime — don't hardcode it
EXPOSE 10000

ENV NODE_ENV=production

CMD ["node", "server.js"]
