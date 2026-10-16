# syntax=docker/dockerfile:1

# Node 22 on Alpine, pinned by version and by digest so a rebuild gets exactly the same base.
# To take a newer base (security fixes), look up the digest of the new tag with
#   docker buildx imagetools inspect node:<version>-alpine<release>
# and change both here. The digest is the multi-platform index, so arm64 hosts build too.
ARG NODE_IMAGE=node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

# ---- build the web app and gather the server code
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY client ./client
# the in-app help is built from the same Markdown files as the docs folder
COPY docs ./docs
RUN npm run build
# .dockerignore already keeps local data out of the build. This is a second guard: anything that
# still slipped into the server folder (a database, uploads, keys, settings) is removed here, in
# a stage that is thrown away, so it can't reach a layer of the runtime image.
COPY server ./server
# server/keys is source code (the key directory), so only key files go, never folders named keys.
RUN find server \( -name data -o -name '*.db' -o -name '*.db-*' -o -name '*.sqlite' -o -name '*.sqlite3' \
      -o -name '*.capsule' -o -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) -prune -exec rm -rf {} +

# ---- runtime: server + built assets only, no dev dependencies
FROM ${NODE_IMAGE}
# The release, for the labels. package.json is where it's written; CI passes it in with
#   --build-arg VERSION=$(node -p "require('./package.json').version")
ARG VERSION=unknown
LABEL org.opencontainers.image.title="Nil" \
      org.opencontainers.image.description="A privacy-first task app for teams, by NØNOS." \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.vendor="NØNOS" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

# run as the unprivileged "node" user; the database and uploads live in /data
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
# Shell form, so PORT is read when the check runs and follows whatever the container was given.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" >/dev/null || exit 1
# node runs as PID 1 and handles SIGTERM itself: it finishes open requests, closes the database
# and exits. docker-compose.yml gives it time to do so (stop_grace_period).
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
