# Minimal Docker image for the mock backend
FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
