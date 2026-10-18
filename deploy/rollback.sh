#!/usr/bin/env bash
# Takes Nil back to the release that ran before the last upgrade, with each database as it was
# just before that upgrade. Everything written since the upgrade is lost, so it asks first.
#
#   hosted  every workspace that still has its checkpoint (CLOUD_CHECKPOINT_KEEP_DAYS) goes back,
#           then the control plane does. Workspaces without one stay on the newer version.
#   single  the app goes back, from the checkpoint upgrade.sh took.
#
#   /opt/nil/deploy/rollback.sh [--yes] [--dry-run]
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"
trap 'log "stopped at line $LINENO: $BASH_COMMAND"' ERR

while [ $# -gt 0 ]; do
  case $1 in
    --yes) YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done
load_env
require docker
if [ "$DRY_RUN" = 0 ] && [ -w /var/log/nil ]; then exec > >(tee -a /var/log/nil/upgrade.log) 2>&1; fi
previous=$NIL_PREVIOUS_VERSION
current=$NIL_VERSION
[ -n "$previous" ] || die "There is no earlier version to go back to (NIL_PREVIOUS_VERSION is empty)."
image_present "$NIL_IMAGE:$previous" || die "$NIL_IMAGE:$previous is no longer on this server. Ship it again with deploy/release.sh."
confirm "Roll back from $current to $previous? Everything written since the upgrade will be lost." || die "Nothing was changed."

if [ "$NIL_MODE" = hosted ]; then
  image_present "$NIL_CLOUD_IMAGE:$previous" || die "$NIL_CLOUD_IMAGE:$previous is no longer on this server."
  step "Workspaces back to their checkpoints"
  failed=0
  compose exec -T control node cli.js rollback --all --yes || failed=1
  step "Control plane back to $previous"
  env_set "$NIL_DIR/.env" NIL_VERSION "$previous"
  env_set "$NIL_DIR/.env" NIL_PREVIOUS_VERSION ""
  compose up -d
  wait_healthy nil-control 180 || die "The control plane didn't become healthy on $previous. See: docker compose logs control"
  compose exec -T control node cli.js routes
  [ "$failed" = 0 ] || die "Some workspaces couldn't be rolled back (see above); they were alerted and left as they were."
  log "Back on $previous."
  exit 0
fi

step "Check the checkpoint"
if [ "$DRY_RUN" = 0 ]; then
  saved=$(docker run --rm --pull never --network none --read-only --cap-drop ALL --user 1000:1000 --volume nil-data:/data:ro --entrypoint cat "$NIL_IMAGE:$previous" /data/.nil-checkpoint/version 2> /dev/null || true)
  [ "$saved" = "$previous" ] || die "The checkpoint in nil-data is ${saved:-missing}, not $previous. Restore from a backup instead (docs/deploy.md)."
fi

step "Back to $previous"
compose stop nil
data_helper "$NIL_IMAGE:$previous" "$ROLLBACK_SCRIPT"
env_set "$NIL_DIR/.env" NIL_VERSION "$previous"
env_set "$NIL_DIR/.env" NIL_PREVIOUS_VERSION ""
compose up -d
wait_healthy nil-app 180 || die "Nil didn't become healthy on $previous. The checkpoint is still in place; see: docker compose logs nil"
data_helper "$NIL_IMAGE:$previous" "$DISCARD_SCRIPT"
log "Back on $previous, with the database from just before the upgrade to $current."
