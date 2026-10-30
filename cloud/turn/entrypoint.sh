#!/bin/sh
# Hosted Nil's relay. It starts as root only to copy Caddy's wildcard certificate, which only
# root may read, into memory for coturn; then coturn runs as nobody, in the control plane's group
# so it can read the database of workspace secrets, with every capability gone.
set -eu

: "${TURN_REALM:?Set TURN_HOST in /opt/nil/.env to the relay host name, the same as CLOUD_TURN_HOST.}"
# The relay shares the host's network, where it would otherwise also listen on the addresses the
# host has on each workspace's network, and workspaces have no way out by design.
: "${TURN_LISTEN_IP:?Set TURN_LISTEN_IP in /opt/nil/.env to the public addresses of this server, such as 203.0.113.10 2001:db8::10.}"
parent=${TURN_REALM#*.}
found=/caddy/caddy/certificates/${TURN_ACME_DIR:-acme-v02.api.letsencrypt.org-directory}/wildcard_.$parent/wildcard_.$parent
certs=/tmp/certs
mkdir -p "$certs"
# modes before owners: with no capabilities but these, root can't change a mode once the file
# is someone else's
if [ -r "$found.crt" ] && [ -r "$found.key" ]; then
  for pair in "crt fullchain" "key privkey"; do
    set -- $pair
    cp "$found.$1" "$certs/$2.pem"
    chmod 400 "$certs/$2.pem"
    chown 65534:65534 "$certs/$2.pem"
  done
else
  echo "Caddy has no certificate for *.$parent yet; the control plane restarts the relay once it has one." >&2
fi
chmod 500 "$certs"
chown 65534:65534 "$certs"
# the database belongs to the control plane, which writes it; coturn reads and sets up its tables
# as a member of the same group. Made here if it's missing, so it never starts out as coturn's.
# Each file is root's for a moment, since root without capabilities may only change modes and
# create files in what it owns.
gid=${TURN_DB_GID:-1000}
db=${TURN_USERDB:-/db/turndb}
chown 0:0 /db
chmod 2770 /db
[ -e "$db" ] || : > "$db"
chown 0:0 "$db"
chmod 660 "$db"
chown 1000:"$gid" "$db" /db

export TURN_CERTS="$certs"
exec setpriv --reuid=65534 --regid=65534 --groups="$gid" --inh-caps=-all sh /etc/coturn/entrypoint.sh
