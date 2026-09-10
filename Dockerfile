# --- Stage 1: Build ---
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# --- Stage 2: Runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "dist/ai-studio-angular-app/server/server.mjs"]
