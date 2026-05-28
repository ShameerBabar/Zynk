FROM node:22-slim

WORKDIR /app

# Copy package configurations
COPY package.json ./
COPY server/package.json ./server/

# Install server dependencies
RUN cd server && npm install --omit=dev

# Copy all other project files
COPY . .

# Expose backend port
EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["npm", "start"]
