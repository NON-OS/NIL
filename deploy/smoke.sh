#!/usr/bin/env bash
# Boots a throwaway Nil workspace from an image, checks what a launch depends on, and removes it
# again: /healthz, the sign-in page, setup with a throwaway wallet, the public proof verifier and
# an encrypted capsule export (deploy/smoke-check.mjs, run inside the container). The workspace
# has its own internal network and volume, no route out, and is never reachable from outside.
#
#   /opt/nil/deploy/smoke.sh [version] [--keep] [--dry-run]
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"

VERSION=
KEEP=0
while [ $# -gt 0 ]; do
  case $1 in
    --keep) KEEP=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) sed -n '2,8p' "$0"; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *) VERSION=$1; shift ;;
  esac
done
if [ -f "$NIL_DIR/.env" ]; then load_env; else NIL_IMAGE=${NIL_IMAGE:-localhost/nonos/nil}; fi
VERSION=${VERSION:-${NIL_VERSION:-latest}}
image="$NIL_IMAGE:$VERSION"
require docker
image_present "$image" || die "$image isn't on this server."

name="nil-smoke-$(date +%s)-$RANDOM"
token=$(head -c 24 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')
cleanup() {
  if [ "$KEEP" = 1 ]; then
    log "Kept $name (container, network and volume). Remove with: docker rm -f $name; docker volume rm $name; docker network rm $name"
    return
  fi
  run docker rm -f "$name" > /dev/null 2>&1 || true
  run docker volume rm "$name" > /dev/null 2>&1 || true
  run docker network rm "$name" > /dev/null 2>&1 || true
}
trap cleanup EXIT

step "Throwaway workspace from $image"
run docker network create --internal "$name" > /dev/null
run docker volume create "$name" > /dev/null
run docker run --detach --pull never --name "$name" --network "$name" --volume "$name:/data" \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m --cap-drop ALL --security-opt no-new-privileges \
  --user 1000:1000 --memory 768m --pids-limit 256 --init \
  --env APP_URL=http://127.0.0.1:3000 --env NOX_RPC_URL=off --env "SETUP_TOKEN=$token" "$image" > /dev/null
wait_healthy "$name" 120 || {
  run docker logs --tail 50 "$name" >&2
  die "The throwaway workspace didn't become healthy."
}

step "Checks"
if [ "$DRY_RUN" = 1 ]; then
  log "would run deploy/smoke-check.mjs inside $name"
else
  docker exec -i --env "SMOKE_SETUP_TOKEN=$token" "$name" node --input-type=module - < "$HERE/smoke-check.mjs" || {
    docker logs --tail 50 "$name" >&2
    die "The smoke test failed for $image."
  }
fi
log "The smoke test passed for $image."
