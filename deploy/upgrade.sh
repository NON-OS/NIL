#!/usr/bin/env bash
# Starts Nil on this server, or upgrades it to a release install.sh has loaded.
#
#   hosted  smoke-tests the new image, moves the control plane to it (new sign-ups get it from
#           then on), then upgrades every running workspace one at a time: stop, checkpoint the
#           database, start the new version, wait for /healthz. A workspace that fails is rolled
#           back to its checkpoint and old version on its own, and the rollout stops after too
#           many failures.
#   single  smoke-tests the new image, checkpoints the database, starts the new version, and
#           rolls back to the checkpoint by itself if /healthz doesn't come up.
#
# On the first deploy nothing runs yet, and it simply starts everything.
#
#   /opt/nil/deploy/upgrade.sh <version> [--max-failures N] [--skip-smoke] [--dry-run]
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"
trap 'log "stopped at line $LINENO: $BASH_COMMAND"' ERR

VERSION=
MAX_FAILURES=
SKIP_SMOKE=0
START_TIMEOUT=180
while [ $# -gt 0 ]; do
  case $1 in
    --max-failures) MAX_FAILURES=$2; shift 2 ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *) VERSION=$1; shift ;;
  esac
done
[ -n "$VERSION" ] || die "Usage: upgrade.sh <version> [--max-failures N] [--skip-smoke] [--dry-run]"
[ -z "$MAX_FAILURES" ] || [[ $MAX_FAILURES =~ ^[0-9]+$ ]] || die "--max-failures must be a whole number."
load_env
require docker
if [ "$DRY_RUN" = 0 ] && [ -w /var/log/nil ]; then exec > >(tee -a /var/log/nil/upgrade.log) 2>&1; fi
log "Upgrade to $VERSION ($NIL_MODE) on $(hostname), currently ${NIL_VERSION:-nothing}"

target="$NIL_IMAGE:$VERSION"
image_present "$target" || die "$target isn't on this server. Ship it first with deploy/release.sh --host."
if [ "$NIL_MODE" = hosted ]; then image_present "$NIL_CLOUD_IMAGE:$VERSION" || die "$NIL_CLOUD_IMAGE:$VERSION isn't on this server."; fi

if [ "$SKIP_SMOKE" = 0 ]; then
  step "Smoke test of $target"
  smoke=("$HERE/smoke.sh" "$VERSION")
  [ "$DRY_RUN" = 1 ] && smoke+=(--dry-run)
  "${smoke[@]}" || die "The smoke test failed. Nothing was changed."
fi

if [ "$NIL_MODE" = hosted ]; then
  if ! container_running nil-control; then
    step "First start"
    env_set "$NIL_DIR/.env" NIL_VERSION "$VERSION"
    compose up -d
    wait_healthy nil-control "$START_TIMEOUT" || die "The control plane didn't become healthy. See: docker compose logs control"
    log "Hosted Nil $VERSION is running. Next: the go-live checklist in cloud/README.md."
    exit 0
  fi

  previous=$NIL_VERSION
  before_previous=$NIL_PREVIOUS_VERSION
  step "Control plane: $previous -> $VERSION"
  if [ "$previous" != "$VERSION" ]; then
    env_set "$NIL_DIR/.env" NIL_PREVIOUS_VERSION "$previous"
    env_set "$NIL_DIR/.env" NIL_VERSION "$VERSION"
  fi
  compose up -d --remove-orphans
  if ! wait_healthy nil-control "$START_TIMEOUT"; then
    warn "The control plane didn't become healthy on $VERSION; going back to $previous."
    env_set "$NIL_DIR/.env" NIL_VERSION "$previous"
    env_set "$NIL_DIR/.env" NIL_PREVIOUS_VERSION "$before_previous"
    compose up -d
    die "Stopped before touching any workspace."
  fi
  # a recreated Caddy has lost its connections to the workspace networks
  compose exec -T control node cli.js routes

  step "Workspaces, one at a time"
  args=(upgrade --all --image "$target")
  [ -z "$MAX_FAILURES" ] || args+=(--max-failures "$MAX_FAILURES")
  if compose exec -T control node cli.js "${args[@]}"; then
    log "Every running workspace is on $VERSION. Stopped and suspended ones move when they are resumed and upgraded."
  else
    die "Some workspaces failed their health check and were rolled back (see above). Fix and run this again; new sign-ups already get $VERSION."
  fi
  exit 0
fi

# single
if ! container_running nil-app; then
  step "First start"
  env_set "$NIL_DIR/.env" NIL_VERSION "$VERSION"
  compose up -d
  wait_healthy nil-app "$START_TIMEOUT" || die "Nil didn't become healthy. See: docker compose logs nil"
  log "Nil $VERSION is running at https://$(env_get "$NIL_DIR/.env" NIL_DOMAIN)."
  exit 0
fi
previous=$NIL_VERSION
if [ "$previous" = "$VERSION" ]; then
  log "Already running $VERSION."
  exit 0
fi

step "Checkpoint the database ($previous)"
compose stop nil
data_helper "$NIL_IMAGE:$previous" "$CHECKPOINT_SCRIPT" "$previous"
env_set "$NIL_DIR/.env" NIL_PREVIOUS_VERSION "$previous"
env_set "$NIL_DIR/.env" NIL_VERSION "$VERSION"

step "Start $VERSION"
compose up -d
if wait_healthy nil-app "$START_TIMEOUT"; then
  log "Nil runs $VERSION. The checkpoint stays until the next upgrade; deploy/rollback.sh goes back to $previous."
  exit 0
fi

warn "$VERSION didn't pass its health check. Rolling back to $previous."
compose stop nil
data_helper "$NIL_IMAGE:$previous" "$ROLLBACK_SCRIPT"
env_set "$NIL_DIR/.env" NIL_VERSION "$previous"
env_set "$NIL_DIR/.env" NIL_PREVIOUS_VERSION ""
compose up -d
wait_healthy nil-app "$START_TIMEOUT" || die "The rollback didn't come up healthy either. The checkpoint is still in the nil-data volume (.nil-checkpoint)."
data_helper "$NIL_IMAGE:$previous" "$DISCARD_SCRIPT"
die "The upgrade to $VERSION failed and Nil is back on $previous with its data as before."
