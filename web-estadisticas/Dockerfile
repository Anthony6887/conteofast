
# CONTEOFAST - FRONTEND NEXT.JS
# Puerto 5003

FROM node:24-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5003
ENV HOSTNAME=0.0.0.0

RUN mkdir -p /app/.next && chown -R node:node /app

COPY --from=builder --chown=node:node \
    /app/public ./public

COPY --from=builder --chown=node:node \
    /app/.next/standalone ./

COPY --from=builder --chown=node:node \
    /app/.next/static ./.next/static

USER node

EXPOSE 5003

CMD ["node", "server.js"]
