# ── Stage 1: install deps ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: build Next.js (standalone output) ──────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_ORIGIN=http://api:3000
RUN npm run build

# ── Stage 3: production runtime ──────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
