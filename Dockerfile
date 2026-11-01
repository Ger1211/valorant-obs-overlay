# Imagen del overlay: Node + curl-impersonate.
#
# curl-impersonate NO es opcional: Cloudflare bloquea el fingerprint TLS del
# curl de Alpine y el fetch de Node con 403. El binario imita a Chrome.

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:24-alpine

# bash: lo necesitan los wrappers de curl-impersonate. curl: diagnostico.
RUN apk add --no-cache bash curl && \
    wget -q -O /tmp/ci.tar.gz https://github.com/lexiforest/curl-impersonate/releases/download/v2.1.1/curl-impersonate-v2.1.1.x86_64-linux-musl.tar.gz && \
    mkdir -p /opt/curl-impersonate && \
    tar -xzf /tmp/ci.tar.gz -C /opt/curl-impersonate && \
    rm /tmp/ci.tar.gz

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4001 \
    ADMIN_PORT=4002 \
    DATA_PATH=/app/data/matches.json \
    PUBLIC_DIR=/app/public \
    TRACKER_CURL_BIN=/opt/curl-impersonate/curl_chrome136

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public

RUN mkdir -p /app/data

EXPOSE 4001 4002

# Sin curl en el host: el healthcheck usa el propio node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
