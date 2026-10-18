# Tor from Debian's stable release, pinned by version and by digest, so a rebuild gets exactly
# the same base. To take a newer one, look up the digest of the new tag with
#   docker buildx imagetools inspect debian:<version>-slim
ARG DEBIAN_IMAGE=debian:13.7-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f
FROM ${DEBIAN_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends tor && rm -rf /var/lib/apt/lists/*
COPY torrc /etc/tor/torrc
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
