# syntax=docker/dockerfile:1

# The Nil control plane. Build from the repository root with
#   docker build -t nonos/nil-cloud:<version> cloud
# (deploy/release.sh does this, with labels). It needs the Docker socket at run time; see
# docker-compose.yml for how it is mounted and why the container is still locked down.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /srv/cloud
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .

# The control database and logs live in /var/lib/nil-cloud; the generated Caddyfile in
# /srv/caddy, a volume Caddy mounts read-only. Both start out owned by the unprivileged user.
RUN mkdir -p /var/lib/nil-cloud /srv/caddy && chown node:node /var/lib/nil-cloud /srv/caddy && chmod 0700 /var/lib/nil-cloud
USER node
EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://127.0.0.1:8081/internal/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "index.js"]
