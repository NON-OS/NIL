#!/usr/bin/env bash
# Installs a release that release.sh copied to /opt/nil/releases/<version>: loads its images
# and puts its scripts and compose files in place. Settings files that already exist are never
# touched, and nothing is started or upgraded: that is upgrade.sh's job.
#
#   /opt/nil/releases/<version>/deploy/install.sh <version>
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"
trap 'log "stopped at line $LINENO: $BASH_COMMAND"' ERR

VERSION=${1:-}
[ -n "$VERSION" ] || die "Usage: install.sh <version> [--dry-run]"
[ "${2:-}" = --dry-run ] && DRY_RUN=1
RELEASE=$(cd "$HERE/.." && pwd)
load_env
[ "$DRY_RUN" = 1 ] || require docker

step "Load images"
for archive in "$RELEASE"/*.tar.gz; do
  case $(basename "$archive") in nil-deploy-*) continue ;; esac
  run docker load --quiet --input "$archive"
done

# Releases up to 3.0.0 named the images nonos/nil and nonos/nil-cloud, which Docker reads as an
# account on Docker Hub that NØNOS doesn't own. Switch .env to the local names, and give the
# images already here those names as well, so the running version and a rollback still find them.
renames=(NIL_IMAGE:nonos/nil:localhost/nonos/nil)
[ "$NIL_MODE" = single ] || renames+=(NIL_CLOUD_IMAGE:nonos/nil-cloud:localhost/nonos/nil-cloud)
for entry in "${renames[@]}"; do
  IFS=: read -r key old new <<< "$entry"
  [ "$(env_get "$NIL_DIR/.env" "$key")" = "$old" ] || continue
  step "Image name $old -> $new"
  if docker info > /dev/null 2>&1; then
    while read -r tag; do
      run docker tag "$old:$tag" "$new:$tag"
    done < <(docker image ls --format '{{.Tag}}' "$old" | grep -vx '<none>' || true)
  fi
  env_set "$NIL_DIR/.env" "$key" "$new"
done
load_env

step "Scripts and compose files"
run install -d -m 750 "$NIL_DIR/deploy/host" "$NIL_DIR/deploy/single" "$NIL_DIR/examples"
for script in lib.sh provision.sh install.sh upgrade.sh rollback.sh smoke.sh; do run install -m 755 "$RELEASE/deploy/$script" "$NIL_DIR/deploy/$script"; done
run install -m 644 "$RELEASE/deploy/smoke-check.mjs" "$RELEASE/deploy/hosted.env.example" "$NIL_DIR/deploy/"
run cp -r "$RELEASE/deploy/host/." "$NIL_DIR/deploy/host/"
run cp -r "$RELEASE/deploy/single/." "$NIL_DIR/deploy/single/"
if [ "$NIL_MODE" = hosted ]; then
  run install -m 644 "$RELEASE/cloud/docker-compose.yml" "$RELEASE/cloud/docker-compose.chain.yml" "$RELEASE/cloud/docker-compose.verifier.yml" "$NIL_DIR/"
  run install -m 644 "$RELEASE/cloud/.env.example" "$NIL_DIR/examples/cloud.env.example"
  run install -m 644 "$RELEASE/cloud/workspace.env.example" "$NIL_DIR/examples/workspace.env.example"
  settings=(cloud.env:examples/cloud.env.example workspace.env:examples/workspace.env.example)
else
  run install -m 644 "$RELEASE/deploy/single/docker-compose.yml" "$RELEASE/deploy/single/Caddyfile" "$NIL_DIR/"
  run install -m 644 "$RELEASE/.env.example" "$NIL_DIR/examples/nil.env.example"
  settings=(nil.env:examples/nil.env.example)
fi

step "Settings"
fresh=()
for pair in "${settings[@]}"; do
  file=${pair%%:*}
  if [ ! -f "$NIL_DIR/$file" ]; then
    run install -m 600 "$NIL_DIR/${pair##*:}" "$NIL_DIR/$file"
    fresh+=("$NIL_DIR/$file")
  fi
done
# the first release becomes the running version; later ones are switched to by upgrade.sh
[ -n "$NIL_VERSION" ] || env_set "$NIL_DIR/.env" NIL_VERSION "$VERSION"

step "Old releases"
# keep the newest five on disk, for rollbacks
mapfile -t old < <(find "$NIL_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2-)
for dir in "${old[@]}"; do run rm -rf "$dir"; done

step "Done"
log "Release $VERSION is installed."
if [ ${#fresh[@]} -gt 0 ]; then
  log "Fill these in before the first start (see cloud/README.md): ${fresh[*]}"
  log "Then: $NIL_DIR/deploy/upgrade.sh $VERSION"
else
  log "To switch to it: $NIL_DIR/deploy/upgrade.sh $VERSION"
fi
