# ── 1. install ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /web
COPY package*.json ./
RUN npm install --no-audit --no-fund

# ── 2. build ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /web
COPY --from=deps /web/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time, so they are build args.
ARG NEXT_PUBLIC_API_URL=http://localhost:5000/api
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
ARG NEXT_PUBLIC_CURRENCY=USD
ARG NEXT_PUBLIC_CURRENCY_RATE=1
ARG NEXT_PUBLIC_MAP_CENTER=0,0
ARG NEXT_PUBLIC_PRICE_STEP=0.25
ARG NEXT_PUBLIC_SEARCH_COUNTRY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY \
    NEXT_PUBLIC_CURRENCY_RATE=$NEXT_PUBLIC_CURRENCY_RATE \
    NEXT_PUBLIC_MAP_CENTER=$NEXT_PUBLIC_MAP_CENTER \
    NEXT_PUBLIC_PRICE_STEP=$NEXT_PUBLIC_PRICE_STEP \
    NEXT_PUBLIC_SEARCH_COUNTRY=$NEXT_PUBLIC_SEARCH_COUNTRY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3. run ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS run
WORKDIR /web
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /web/.next/standalone ./
COPY --from=build /web/.next/static ./.next/static
COPY --from=build /web/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
