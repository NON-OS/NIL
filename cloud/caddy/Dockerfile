# syntax=docker/dockerfile:1.27.1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# Caddy with a DNS provider module, needed only for CLOUD_TLS=wildcard (one *.domain
# certificate through the DNS challenge). The stock image is enough for on-demand TLS.
#   docker build --build-arg DNS_MODULE=github.com/caddy-dns/hetzner/v2@v2.0.0-preview-3 -t localhost/nonos/nil-caddy:2.10.2-dns cloud/caddy
# then set CADDY_IMAGE=localhost/nonos/nil-caddy:2.10.2-dns in /opt/nil/.env and
# CLOUD_DNS_PROVIDER to the module's name in cloud.env (hetzner for the example above).
#
# Both Caddy images are pinned by digest, and the module by version: a build never takes
# whatever was pushed last. The module's own go.mod names the Caddy it needs; pick a version made
# for this Caddy, or move both images to a newer Caddy together. To look up a digest:
#   docker buildx imagetools inspect caddy:<version>
ARG CADDY_BUILDER_IMAGE=caddy:2.10.2-builder@sha256:01668408cc26e2e00c9d067c30cb43b2ba14ad1f2808beda55503cb2a31f59dc
ARG CADDY_IMAGE=caddy:2.10.2@sha256:c3d7ee5d2b11f9dc54f947f68a734c84e9c9666c92c88a7f30b9cba5da182adb
FROM ${CADDY_BUILDER_IMAGE} AS build
ARG DNS_MODULE
RUN case "$DNS_MODULE" in \
      *@v[0-9]*) ;; \
      *) echo "Pass --build-arg DNS_MODULE=github.com/caddy-dns/<provider>@v<version>, with a version" && false ;; \
    esac
RUN xcaddy build --with "$DNS_MODULE"

FROM ${CADDY_IMAGE}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
