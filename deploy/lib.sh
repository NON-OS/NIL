# shellcheck shell=bash
# Shared by the deploy scripts. Sourced, never run on its own.

NIL_DIR=${NIL_DIR:-/opt/nil}
DRY_RUN=${DRY_RUN:-0}
YES=${YES:-0}

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
step() { printf '\n== %s\n' "$*" >&2; }
warn() { log "warning: $*"; }
die() {
  log "error: $*"
  exit 1
}

# Runs a command, or with --dry-run only prints it. Read-only checks are run directly, so a dry
# run still shows what would really happen on this machine.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '  would run: %s\n' "$(printf '%q ' "$@")" >&2
  else
    "$@"
  fi
}

require() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" > /dev/null 2>&1 || die "$cmd is needed but not installed."
  done
}

# Installs stdin at PATH with MODE (and OWNER, as user:group) when the content differs from what
# is there. Returns 0 when the file changed, 1 when it was already right, so a caller restarts a
# service only when its configuration really changed.
install_file() {
  local path=$1 mode=$2 owner=${3:-root:root} tmp
  tmp=$(mktemp)
  cat > "$tmp"
  if [ -f "$path" ] && cmp -s "$tmp" "$path"; then
    rm -f "$tmp"
    return 1
  fi
  if [ "$DRY_RUN" = 1 ]; then
    log "would write $path"
    rm -f "$tmp"
    return 0
  fi
  install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$tmp" "$path"
  rm -f "$tmp"
  log "wrote $path"
}

# Reads one KEY=VALUE from an env file (the last one wins, as in Docker Compose).
env_get() {
  local file=$1 key=$2
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

# Sets KEY=VALUE in an env file, keeping every other line, the file's owner and its mode.
env_set() {
  local file=$1 key=$2 value=$3 tmp
  if [ "$DRY_RUN" = 1 ]; then
    log "would set $key=$value in $file"
    return 0
  fi
  [ -f "$file" ] || install -m 600 /dev/null "$file"
  if grep -q "^${key}=" "$file"; then
    tmp=$(mktemp)
    awk -v key="$key" -v value="$value" 'index($0, key "=") == 1 { print key "=" value; next } { print }' "$file" > "$tmp"
    cat "$tmp" > "$file"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# Asks before something that can't be undone. --yes answers for scripts.
confirm() {
  local answer
  [ "$YES" = 1 ] && return 0
  [ -t 0 ] || die "This needs confirmation. Run it in a terminal, or pass --yes."
  read -r -p "$1 Type yes to continue: " answer
  [ "$answer" = yes ]
}

# Waits for a container's Docker health check. Fails as soon as the container stops or Docker
# calls it unhealthy, which only happens after the image's start period and several failed checks.
wait_healthy() {
  local container=$1 timeout=${2:-180} waited=0 status=unknown
  if [ "$DRY_RUN" = 1 ]; then
    log "would wait for $container to report healthy"
    return 0
  fi
  while [ "$waited" -lt "$timeout" ]; do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2> /dev/null || echo missing)
    case $status in
      healthy) return 0 ;;
      unhealthy | exited | dead | missing)
        log "$container is $status"
        return 1
        ;;
    esac
    sleep 2
    waited=$((waited + 2))
  done
  log "$container didn't become healthy within ${timeout}s (last state: $status)"
  return 1
}

# The server's deployment settings: NIL_MODE (hosted or single), image names and versions.
# The variables are read by the scripts that source this file.
# shellcheck disable=SC2034
load_env() {
  [ -f "$NIL_DIR/.env" ] || die "$NIL_DIR/.env is missing. Run deploy/provision.sh on the server first."
  NIL_MODE=$(env_get "$NIL_DIR/.env" NIL_MODE)
  NIL_IMAGE=$(env_get "$NIL_DIR/.env" NIL_IMAGE)
  NIL_IMAGE=${NIL_IMAGE:-nonos/nil}
  NIL_CLOUD_IMAGE=$(env_get "$NIL_DIR/.env" NIL_CLOUD_IMAGE)
  NIL_CLOUD_IMAGE=${NIL_CLOUD_IMAGE:-nonos/nil-cloud}
  NIL_VERSION=$(env_get "$NIL_DIR/.env" NIL_VERSION)
  NIL_PREVIOUS_VERSION=$(env_get "$NIL_DIR/.env" NIL_PREVIOUS_VERSION)
  case $NIL_MODE in
    hosted | single) ;;
    *) die "NIL_MODE in $NIL_DIR/.env must be hosted or single." ;;
  esac
}

compose() {
  run docker compose --project-directory "$NIL_DIR" "$@"
}

image_present() {
  if [ "$DRY_RUN" = 1 ] && ! docker info > /dev/null 2>&1; then
    log "dry run: Docker isn't reachable here, assuming $1 is loaded"
    return 0
  fi
  docker image inspect "$1" > /dev/null 2>&1
}

# Whether a container exists and runs. A dry run without Docker counts it as running.
container_running() {
  if [ "$DRY_RUN" = 1 ] && ! docker info > /dev/null 2>&1; then
    return 0
  fi
  [ "$(docker inspect --format '{{.State.Running}}' "$1" 2> /dev/null)" = true ]
}

# Single mode: the app's database is checkpointed and rolled back the same way the hosted
# control plane does it (cloud/runtime/dataLayout.js), with the app stopped so the files on disk
# are exactly what it left. A missing file is checkpointed as an empty one, so a rollback also
# clears what the newer version created; an empty WAL and shared-memory file let SQLite start clean.
# The scripts run inside the helper container, so their $ references are meant for its shell.
# shellcheck disable=SC2034,SC2016
CHECKPOINT_SCRIPT='set -eu
rm -rf /data/.nil-checkpoint
mkdir -m 700 /data/.nil-checkpoint
for f in nonos.db nonos.db-wal; do
  if [ -f "/data/$f" ]; then cp -p "/data/$f" /data/.nil-checkpoint/; else : > "/data/.nil-checkpoint/$f"; fi
done
printf "%s\n" "$1" > /data/.nil-checkpoint/version'
# shellcheck disable=SC2034
ROLLBACK_SCRIPT='set -eu
test -f /data/.nil-checkpoint/nonos.db
cp -p /data/.nil-checkpoint/nonos.db /data/nonos.db
cp -p /data/.nil-checkpoint/nonos.db-wal /data/nonos.db-wal
: > /data/nonos.db-shm'
# shellcheck disable=SC2034
DISCARD_SCRIPT='rm -rf /data/.nil-checkpoint'

# Runs one of the scripts above against the single-mode data volume, in a throwaway container of
# the app's own image (it has a shell and the app's user), with no network and nothing else mounted.
data_helper() {
  local image=$1 script=$2
  shift 2
  run docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 \
    --volume nil-data:/data --entrypoint sh "$image" -c "$script" sh "$@"
}
