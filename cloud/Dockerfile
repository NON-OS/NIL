# syntax=docker/dockerfile:1.27.1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# The Nil control plane. Build from the repository root with
#   docker build -t localhost/nonos/nil-cloud:<version> cloud
# (deploy/release.sh does this, with labels). It needs the Docker socket at run time; see
# docker-compose.yml for how it is mounted and why the container is still locked down.

# Node 22 on Alpine, pinned by version and by digest like the app's own image (the root
# Dockerfile), so a rebuild gets exactly the same base. To take a newer one, look up the digest
# of the new tag with
#   docker buildx imagetools inspect node:<version>-alpine<release>
# and change both here and in the root Dockerfile.
ARG NODE_IMAGE=node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

# The sign-up page's phone wallet script: WalletConnect's client and the dialog around it, bundled
# from the pinned dev dependencies in the lockfile. Only the built file leaves this stage, so the
# image itself still holds production dependencies alone.
FROM ${NODE_IMAGE} AS phone
WORKDIR /srv/cloud
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY phone ./phone
COPY scripts/buildPhone.mjs ./scripts/buildPhone.mjs
RUN npm run build:phone

FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /srv/cloud
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
COPY --from=phone /srv/cloud/dist/phone.js ./dist/phone.js

# The control database and logs live in /var/lib/nil-cloud; the generated Caddyfile in
# /srv/caddy, a volume Caddy mounts read-only. Both start out owned by the unprivileged user.
# /var/lib/nil-turn: the relay's database of workspace secrets, on a volume the relay reads as a
# member of this group
RUN mkdir -p /var/lib/nil-cloud /srv/caddy /var/lib/nil-turn && chown node:node /var/lib/nil-cloud /srv/caddy /var/lib/nil-turn && chmod 0700 /var/lib/nil-cloud && chmod 2770 /var/lib/nil-turn
USER node
EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://127.0.0.1:8081/internal/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "index.js"]
