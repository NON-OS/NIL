#!/bin/sh
# Tor refuses to start unless its key folder belongs to it and nobody else can read it. This
# runs as root with only the capabilities that takes (docker-compose.tor.yml), then Tor drops to
# its own user (User in torrc).
set -e
mkdir -p /var/lib/tor/nonos
chown -R debian-tor:debian-tor /var/lib/tor
chmod 700 /var/lib/tor /var/lib/tor/nonos
exec tor -f /etc/tor/torrc
