#!/bin/sh
# Writes coturn's settings for this server into a file only coturn's process can read, from
# turnserver.conf and the environment, then starts it. The shared secret goes into that file
# and nowhere else: not the command line, where every process on the host could read it.
set -eu

: "${TURN_SECRET:?Set TURN_SECRET in .env to the same value Nil uses.}"
: "${TURN_REALM:?Set TURN_REALM in .env to the relay host name, such as turn.example.com.}"
if [ "${#TURN_SECRET}" -lt 32 ]; then
  echo "TURN_SECRET is shorter than 32 characters. Make one with: openssl rand -hex 32" >&2
  exit 1
fi

conf=/tmp/turnserver.conf
umask 077
cp /etc/coturn/turnserver.conf "$conf"
{
  echo "static-auth-secret=$TURN_SECRET"
  echo "realm=$TURN_REALM"
  echo "server-name=$TURN_REALM"
  # the public address browsers reach, and the private one behind it when there's NAT, as
  # "public" or "public/private"
  if [ -n "${TURN_EXTERNAL_IP:-}" ]; then echo "external-ip=$TURN_EXTERNAL_IP"; fi
  # the relay's own address when it's private behind NAT, so two people on this relay can
  # still reach each other through it
  for ip in ${TURN_ALLOWED_PEER_IP:-}; do echo "allowed-peer-ip=$ip"; done
  if [ -n "${TURN_MIN_PORT:-}" ]; then echo "min-port=$TURN_MIN_PORT"; fi
  if [ -n "${TURN_MAX_PORT:-}" ]; then echo "max-port=$TURN_MAX_PORT"; fi
  if [ -r /certs/fullchain.pem ] && [ -r /certs/privkey.pem ]; then
    echo "cert=/certs/fullchain.pem"
    echo "pkey=/certs/privkey.pem"
  else
    echo "TURN over TLS (5349) is off: mount the certificate and key at /certs/fullchain.pem and /certs/privkey.pem." >&2
    echo "no-tls"
  fi
  if [ "${TURN_LOG:-off}" = "on" ]; then echo "log-file=stdout"; else echo "no-stdout-log"; echo "log-file=/dev/null"; fi
} >> "$conf"

exec turnserver -c "$conf"
