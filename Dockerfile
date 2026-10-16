# syntax=docker/dockerfile:1

# ---- build the web app and gather the server code
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY client ./client
RUN npm run build
# .dockerignore already keeps local data out of the build. This is a second guard: anything that
# still slipped into the server folder (a database, uploads, keys, settings) is removed here, in
# a stage that is thrown away, so it can't reach a layer of the runtime image.
COPY server ./server
RUN find server \( -name data -o -name keys -o -name '*.db' -o -name '*.db-*' -o -name '*.sqlite' -o -name '*.sqlite3' \
      -o -name '*.capsule' -o -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) -prune -exec rm -rf {} +

# ---- runtime: server + built assets only, no dev dependencies
FROM node:22-alpine
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
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
