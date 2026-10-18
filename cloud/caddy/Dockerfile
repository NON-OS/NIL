# syntax=docker/dockerfile:1.27.1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# Caddy with a DNS provider module, needed only for CLOUD_TLS=wildcard (one *.domain
# certificate through the DNS challenge). The stock image is enough for on-demand TLS.
#   docker build --build-arg DNS_MODULE=github.com/caddy-dns/hetzner/v2@v2.0.0-preview-3 -t localhost/nonos/nil-caddy:2.10.2-dns cloud/caddy
# then set CADDY_IMAGE=localhost/nonos/nil-caddy:2.10.2-dns in /opt/nil/.env and
# CLOUD_DNS_PROVIDER to the module's name in cloud.env (hetzner for the example above).
#
# Both Caddy images are pinned by digest, and the module by version: a build never takes
# whatever was pushed last. The module's own go.mod names the Caddy it needs, and the build stops
# if that is a newer Caddy than these images. Pick a version made for this Caddy, or move both
# images (and CADDY_VERSION in deploy/release.sh) to a newer Caddy together. To look up a digest:
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
# Go raises Caddy without a word when the module needs a newer one, and the image would still be
# tagged for this one. CADDY_VERSION is the builder image's own: the Caddy xcaddy was asked for.
RUN built=$(/usr/bin/caddy version | cut -d ' ' -f 1); \
    if [ -z "$CADDY_VERSION" ] || [ "$built" != "$CADDY_VERSION" ]; then \
      echo "xcaddy was asked for Caddy ${CADDY_VERSION:-(the builder image names none)} and made ${built:-nothing that runs}. $DNS_MODULE needs another Caddy: pick a version of it made for this one, or move both Caddy images to the Caddy it needs." && false; \
    fi

FROM ${CADDY_IMAGE}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
