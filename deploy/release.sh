#!/usr/bin/env bash
# Builds a Nil release from this repository and ships it to the server, without needing a
# public registry. Run it on your own machine (or CI) with Docker, from a clean checkout. The
# images are built from the committed tree (git archive of HEAD), so a file that isn't committed
# never ships, and the web app is byte for byte the release anyone can rebuild:
#
#   deploy/release.sh --host deploy@nil.example          build, copy over SSH, verify, load, install
#   deploy/release.sh --registry registry.example/nonos  build and push to your own registry
#   deploy/release.sh                                    build only, into ~/.cache/nil-releases/<version>
#
# It never starts or upgrades anything on the server; deploy/upgrade.sh does that.
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"
trap 'log "stopped at line $LINENO: $BASH_COMMAND"' ERR

MODE=hosted
VERSION=
HOST=
REGISTRY=
OUT=
ALLOW_DIRTY=0
PLATFORM=linux/amd64
CADDY_DNS_MODULE=
CADDY_VERSION=2.10.2
# localhost/ keeps the names off Docker Hub, where nonos/... would belong to whoever owns that
# account: the server only ever runs images this script copied to it
APP_REPO=${NIL_IMAGE_NAME:-localhost/nonos/nil}
CLOUD_REPO=${NIL_CLOUD_IMAGE_NAME:-localhost/nonos/nil-cloud}
CADDY_REPO=${NIL_CADDY_IMAGE_NAME:-localhost/nonos/nil-caddy}

usage() {
  cat << 'EOF'
Usage: release.sh [options]

  --mode hosted|single        hosted builds the app and the control plane (default); single only the app
  --version V                 release version (default: package.json's, plus the commit unless it is tagged vV)
  --host USER@SERVER          copy the release to the server over SSH, check it and load it there
  --registry PREFIX           also push the images to PREFIX/nil and PREFIX/nil-cloud, a registry
                              the foundation controls
  --caddy-dns-module MODULE   also build Caddy with a DNS module at a fixed version, for wildcard
                              TLS (e.g. github.com/caddy-dns/hetzner@v1.0.0)
  --out DIR                   where to put the release files
  --platform P                image platform (default linux/amd64)
  --allow-dirty               a test build from the working tree as it is, uncommitted and
                              untracked files included
  --dry-run                   print what would happen without building or copying anything
EOF
}

while [ $# -gt 0 ]; do
  case $1 in
    --mode) MODE=$2; shift 2 ;;
    --version) VERSION=$2; shift 2 ;;
    --host) HOST=$2; shift 2 ;;
    --registry) REGISTRY=${2%/}; shift 2 ;;
    --caddy-dns-module) CADDY_DNS_MODULE=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --platform) PLATFORM=$2; shift 2 ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
done
case $MODE in hosted | single) ;; *) die "--mode must be hosted or single." ;; esac
if [ -n "$CADDY_DNS_MODULE" ] && ! [[ $CADDY_DNS_MODULE =~ @v[0-9] ]]; then
  die "--caddy-dns-module needs a version, such as github.com/caddy-dns/hetzner@v1.0.0, so a build never takes whatever the module's latest is."
fi
require git tar gzip sha256sum
[ "$DRY_RUN" = 1 ] || require docker
[ -z "$HOST" ] || require ssh scp

step "Version"
cd "$ROOT"
dirty=$(git status --porcelain --untracked-files=no)
[ -z "$dirty" ] || [ "$ALLOW_DIRTY" = 1 ] || die "The checkout has uncommitted changes. Commit them, or pass --allow-dirty for a test build."
# a test build takes the working tree as it is, untracked files too, and says so in its version
[ "$ALLOW_DIRTY" = 0 ] || dirty=$(git status --porcelain)
commit=$(git rev-parse HEAD)
if [ -z "$VERSION" ]; then
  base=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json | head -n 1)
  [ -n "$base" ] || die "Couldn't read the version from package.json."
  # a tagged release keeps its plain version; any other commit gets its own tag, so two
  # different builds never share a version on the server
  if git tag --points-at HEAD | grep -qx "v$base"; then VERSION=$base; else VERSION="$base-${commit:0:12}"; fi
  [ -z "$dirty" ] || VERSION="$VERSION-dirty"
fi
[[ $VERSION =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || die "Version $VERSION can't be used as an image tag."
OUT=${OUT:-${XDG_CACHE_HOME:-$HOME/.cache}/nil-releases/$VERSION}
log "Release $VERSION ($MODE) from commit ${commit:0:12}, files in $OUT"
run mkdir -p "$OUT"

# Everything below builds from SRC: the files of HEAD, unpacked from git, or with --allow-dirty
# the working tree. Untracked files under client/public or docs would otherwise end up in the
# image and break the byte-for-byte check of a running server against the release.
SRC=$ROOT
if [ "$ALLOW_DIRTY" = 0 ]; then
  SRC=$(mktemp -d "${TMPDIR:-/tmp}/nil-release-XXXXXX")
  trap 'rm -rf "$SRC"' EXIT
  git archive --format=tar HEAD | tar -x -C "$SRC"
elif [ -n "$(git status --porcelain --untracked-files=normal | grep '^??' || true)" ]; then
  warn "--allow-dirty: untracked files go into this build, so it won't match a release."
fi

# Where the source can be found, for the image labels. Credentials in a remote URL are dropped.
source_url=${NIL_SOURCE_URL:-$(git remote get-url origin 2> /dev/null | sed -E 's#://[^/@]+@#://#; s#^git@([^:]+):#https://\1/#; s#\.git$##' || true)}
labels() {
  local title=$1 description=$2
  printf -- '--label\0%s\0' \
    "org.opencontainers.image.title=$title" \
    "org.opencontainers.image.description=$description" \
    "org.opencontainers.image.version=$VERSION" \
    "org.opencontainers.image.revision=$commit" \
    "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "org.opencontainers.image.licenses=AGPL-3.0-or-later" \
    "org.opencontainers.image.vendor=NØNOS foundation" \
    "org.opencontainers.image.source=$source_url"
}

step "Build"
mapfile -d '' app_labels < <(labels Nil 'Nil, the private task app for teams, by NØNOS')
run docker build --pull --platform "$PLATFORM" "${app_labels[@]}" -t "$APP_REPO:$VERSION" -t "$APP_REPO:latest" "$SRC"
images=("$APP_REPO:$VERSION")
if [ "$MODE" = hosted ]; then
  mapfile -d '' cloud_labels < <(labels 'Nil control plane' 'Runs hosted Nil: one isolated container per workspace')
  run docker build --pull --platform "$PLATFORM" "${cloud_labels[@]}" -t "$CLOUD_REPO:$VERSION" -t "$CLOUD_REPO:latest" "$SRC/cloud"
  images+=("$CLOUD_REPO:$VERSION")
fi
if [ -n "$CADDY_DNS_MODULE" ]; then
  run docker build --pull --platform "$PLATFORM" --build-arg "DNS_MODULE=$CADDY_DNS_MODULE" \
    -t "$CADDY_REPO:$CADDY_VERSION-dns" "$SRC/cloud/caddy"
  images+=("$CADDY_REPO:$CADDY_VERSION-dns")
fi

step "Image archives"
for image in "${images[@]}"; do
  file="$OUT/$(echo "${image##*/}" | tr ':' '-').tar.gz"
  if [ "$DRY_RUN" = 1 ]; then log "would save $image to $file"; else docker save "$image" | gzip -n > "$file"; fi
done

step "Software bill of materials"
# Made offline: syft (or the older docker sbom plugin) reads the local images if installed; npm
# always lists the exact dependency versions from the lockfiles. A missing tool never stops a
# release, it only leaves that list out.
for image in "${images[@]}"; do
  sbom="$OUT/$(echo "${image##*/}" | tr ':' '-').spdx.json"
  if command -v syft > /dev/null 2>&1; then
    run syft -q "docker:$image" -o "spdx-json=$sbom" || warn "syft couldn't describe $image."
  elif docker sbom version > /dev/null 2>&1; then
    if [ "$DRY_RUN" = 1 ]; then log "would write $sbom with docker sbom"; else docker sbom --format spdx-json "$image" > "$sbom" || warn "docker sbom couldn't describe $image."; fi
  fi
done
if npm sbom --help > /dev/null 2>&1; then
  for dir in . cloud; do
    [ "$dir" = cloud ] && [ "$MODE" = single ] && continue
    name=$([ "$dir" = . ] && echo nil || echo nil-cloud)
    target="$OUT/$name-$VERSION.npm.cdx.json"
    if [ "$DRY_RUN" = 1 ]; then
      log "would write $target"
    elif ! (cd "$SRC/$dir" && npm sbom --sbom-format cyclonedx --omit dev --package-lock-only) > "$target"; then
      rm -f "$target"
      warn "npm couldn't list the dependencies of $dir."
    fi
  done
else
  warn "npm sbom isn't available (npm 10.1 or newer has it); no dependency list in this release."
fi

step "Deploy bundle"
bundle_files=(deploy/lib.sh deploy/provision.sh deploy/install.sh deploy/upgrade.sh deploy/rollback.sh deploy/backup.sh deploy/smoke.sh deploy/smoke-check.mjs
  deploy/hosted.env.example deploy/host deploy/single .env.example cloud/docker-compose.yml cloud/docker-compose.chain.yml cloud/docker-compose.verifier.yml cloud/.env.example cloud/workspace.env.example)
run tar -czf "$OUT/nil-deploy-$VERSION.tar.gz" --owner=0 --group=0 -C "$SRC" "${bundle_files[@]}"

step "Checksums"
if [ "$DRY_RUN" = 1 ]; then
  log "would write $OUT/SHA256SUMS"
else
  sums=$(mktemp)
  (cd "$OUT" && find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%f\n' | sort | xargs sha256sum) > "$sums"
  mv "$sums" "$OUT/SHA256SUMS"
  chmod 644 "$OUT/SHA256SUMS"
fi

if [ -n "$REGISTRY" ]; then
  step "Push to $REGISTRY"
  for image in "${images[@]}"; do
    name=${image%%:*}
    target="$REGISTRY/${name##*/}"
    tags=("${image##*:}")
    # the app and the control plane also move :latest; the Caddy build keeps its own tag only
    [ "${image##*:}" = "$VERSION" ] && tags+=(latest)
    for tag in "${tags[@]}"; do
      run docker tag "$image" "$target:$tag"
      run docker push "$target:$tag"
    done
  done
  log "On the server, set NIL_IMAGE=$REGISTRY/nil (and NIL_CLOUD_IMAGE=$REGISTRY/nil-cloud) in /opt/nil/.env, docker pull the $VERSION tags, and set CLOUD_IMAGE_PULL=missing in cloud.env only if workspaces should pull from there."
fi

if [ -n "$HOST" ]; then
  step "Ship to $HOST"
  remote="$NIL_DIR/releases/$VERSION"
  run ssh "$HOST" "mkdir -p '$remote'"
  run scp -q "$OUT"/* "$HOST:$remote/"
  # checked on the server, so a broken copy is never loaded
  run ssh "$HOST" "cd '$remote' && sha256sum --check --quiet SHA256SUMS && tar -xzf 'nil-deploy-$VERSION.tar.gz' && bash deploy/install.sh '$VERSION'"
fi

step "Done"
log "Release $VERSION is ready${HOST:+ on $HOST}."
[ -z "$HOST" ] || log "Next, on the server: $NIL_DIR/deploy/upgrade.sh $VERSION"
