# syntax=docker/dockerfile:1

# Caddy with a DNS provider module, needed only for CLOUD_TLS=wildcard (one *.domain
# certificate through the DNS challenge). The stock image is enough for on-demand TLS.
#   docker build --build-arg DNS_MODULE=github.com/caddy-dns/hetzner -t nil-caddy:2.10.2-dns cloud/caddy
# then set CADDY_IMAGE=nil-caddy:2.10.2-dns in /opt/nil/.env and CLOUD_DNS_PROVIDER to the
# module's name in cloud.env (hetzner for the example above).
ARG CADDY_VERSION=2.10.2
FROM caddy:${CADDY_VERSION}-builder AS build
ARG DNS_MODULE
RUN test -n "$DNS_MODULE" || (echo "Pass --build-arg DNS_MODULE=github.com/caddy-dns/<provider>" && false)
RUN xcaddy build --with "$DNS_MODULE"

FROM caddy:${CADDY_VERSION}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
