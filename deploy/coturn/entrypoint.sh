#!/bin/sh
# Writes coturn's settings for this server into a file only coturn's process can read, from
# turnserver.conf and the environment, then starts it. The shared secret goes into that file
# and nowhere else: not the command line, where every process on the host could read it.
# Hosted Nil gives each workspace its own secret instead, kept in a database (TURN_USERDB) that
# its control plane writes and coturn reads on every login.
set -eu

: "${TURN_REALM:?Set TURN_REALM in .env to the relay host name, such as turn.example.com.}"
if [ -z "${TURN_USERDB:-}" ]; then
  : "${TURN_SECRET:?Set TURN_SECRET in .env to the same value Nil uses.}"
  if [ "${#TURN_SECRET}" -lt 32 ]; then
    echo "TURN_SECRET is shorter than 32 characters. Make one with: openssl rand -hex 32" >&2
    exit 1
  fi
fi
certs=${TURN_CERTS:-/certs}

conf=/tmp/turnserver.conf
umask 077
cp /etc/coturn/turnserver.conf "$conf"
{
  if [ -n "${TURN_USERDB:-}" ]; then echo "userdb=$TURN_USERDB"; else echo "static-auth-secret=$TURN_SECRET"; fi
  echo "realm=$TURN_REALM"
  echo "server-name=$TURN_REALM"
  # the public address browsers reach, and the private one behind it when there's NAT, as
  # "public" or "public/private"
  if [ -n "${TURN_EXTERNAL_IP:-}" ]; then echo "external-ip=$TURN_EXTERNAL_IP"; fi
  # only these addresses, when set: on the host's network coturn otherwise listens on every
  # address the host has, its Docker networks' too
  for ip in ${TURN_LISTEN_IP:-}; do echo "listening-ip=$ip"; done
  # The relay's own addresses. Everyone in a call has their relayed address there, and coturn
  # refuses to relay to its own addresses unless they're allowed, so without them two people on
  # this relay couldn't reach each other. It only ever sends UDP onward (no-tcp-relay), and what
  # listens on UDP at a public address is public anyway. TURN_ALLOWED_PEER_IP adds more.
  own="${TURN_LISTEN_IP:-} $(echo "${TURN_EXTERNAL_IP:-}" | tr / ' ')"
  for ip in $own ${TURN_ALLOWED_PEER_IP:-}; do echo "allowed-peer-ip=$ip"; done
  if [ -z "$(echo $own)" ]; then
    echo "Neither TURN_EXTERNAL_IP nor TURN_LISTEN_IP is set, so two people on this relay can't reach each other through it. Set TURN_EXTERNAL_IP to its public address." >&2
  fi
  if [ -n "${TURN_MIN_PORT:-}" ]; then echo "min-port=$TURN_MIN_PORT"; fi
  if [ -n "${TURN_MAX_PORT:-}" ]; then echo "max-port=$TURN_MAX_PORT"; fi
  if [ -r "$certs/fullchain.pem" ] && [ -r "$certs/privkey.pem" ]; then
    echo "cert=$certs/fullchain.pem"
    echo "pkey=$certs/privkey.pem"
  else
    echo "TURN over TLS (5349) is off: mount the certificate and key at $certs/fullchain.pem and $certs/privkey.pem." >&2
    echo "no-tls"
  fi
  if [ "${TURN_LOG:-off}" = "on" ]; then echo "log-file=stdout"; else echo "no-stdout-log"; echo "log-file=/dev/null"; fi
} >> "$conf"

# the database of secrets is shared with whoever writes it, through its folder's group
if [ -n "${TURN_USERDB:-}" ]; then umask 007; fi
exec turnserver -c "$conf"
