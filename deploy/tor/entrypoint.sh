#!/bin/sh
# Tor refuses to start unless its key folder belongs to it and nobody else can read it.
set -e
mkdir -p /var/lib/tor/nonos
chown -R debian-tor:debian-tor /var/lib/tor
chmod 700 /var/lib/tor /var/lib/tor/nonos
exec tor -f /etc/tor/torrc
