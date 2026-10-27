#!/usr/bin/env bash
# Backs up a self-hosted Nil while it runs. Inside the app's own container, SQLite's VACUUM INTO
# writes a consistent copy of the database, and the copy is opened on its own and checked
# (PRAGMA integrity_check and foreign_key_check). The copy, the keys and the uploads then go into
# one archive, whose database must hash the same as the copy that was checked. With
# --age-recipient the archive is encrypted with age and no plaintext copy stays. Archives older
# than --keep-days are deleted. Hosted servers back up through the control plane instead.
#
#   /opt/nil/deploy/backup.sh [--container nil-app] [--dest /var/backups/nil] [--keep-days 14]
#                             [--age-recipient age1...] [--dry-run]
#
# To restore, see docs/deploy.md, "Restore from a backup archive".
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"
trap 'log "stopped at line $LINENO: $BASH_COMMAND"' ERR

CONTAINER=nil-app
DEST=/var/backups/nil
KEEP_DAYS=14
RECIPIENT=
while [ $# -gt 0 ]; do
  case $1 in
    --container) CONTAINER=$2; shift 2 ;;
    --dest) DEST=$2; shift 2 ;;
    --keep-days) KEEP_DAYS=$2; shift 2 ;;
    --age-recipient) RECIPIENT=$2; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) sed -n '2,13p' "$0"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done
[[ $KEEP_DAYS =~ ^[0-9]+$ ]] || die "--keep-days takes a whole number of days."
require docker tar gzip sha256sum
[ -z "$RECIPIENT" ] || require age
[ "$DRY_RUN" = 1 ] || [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2> /dev/null)" = true ] || die "$CONTAINER isn't running. Start Nil first, or name its container with --container."

# Runs in the app's container, as the app's user, with the node already there. The copy goes in
# DATA_DIR/.nil-snapshot, the folder the hosted control plane uses for the same thing. A copy
# that fails a check is deleted and the backup stops. Only a search index out of step with its
# rows passes with a warning: the server rebuilds the index from the rows by itself.
# shellcheck disable=SC2016
SNAPSHOT_SCRIPT='
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const data = process.env.DATA_DIR || "/data";
const dir = `${data}/.nil-snapshot`;
const out = `${dir}/nonos.db`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { mode: 0o700 });
const live = new DatabaseSync(process.env.DB_FILE || `${data}/nonos.db`);
live.exec("PRAGMA busy_timeout = 15000");
live.exec(`VACUUM INTO '"'"'${out}'"'"'`);
live.close();
const copy = new DatabaseSync(out);
// calls going on are this server's alone while they last; a backup never carries one
for (const table of ["call_events", "call_instances", "call_people", "calls"]) {
  try {
    copy.exec("DELETE FROM " + table);
  } catch {}
}
const found = copy.prepare("PRAGMA integrity_check").all().map((r) => r.integrity_check).filter((line) => line !== "ok");
const index = found.filter((line) => /FTS5 table main\.task_search/.test(line));
const problems = found.filter((line) => !index.includes(line));
if (copy.prepare("PRAGMA foreign_key_check").all().length) problems.push("rows that point at rows that are not there");
const schema = copy.prepare("PRAGMA user_version").get().user_version;
copy.close();
if (problems.length) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error(`The copy of the database failed its checks: ${problems.slice(0, 5).join("; ")}`);
  process.exit(1);
}
if (index.length) console.error("warning: the search index is out of step with its rows; the server rebuilds it within the hour");
// hashed a megabyte at a time, so a large database is never read into memory whole
const hash = crypto.createHash("sha256");
const fd = fs.openSync(out, "r");
const chunk = Buffer.alloc(1 << 20);
for (let n; (n = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0; ) hash.update(chunk.subarray(0, n));
fs.closeSync(fd);
console.log(JSON.stringify({ schema, bytes: fs.statSync(out).size, sha256: hash.digest("hex") }));
'

STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="nil-$STAMP.tar.gz"
if [ "$DRY_RUN" = 1 ]; then
  log "would snapshot and check the database in $CONTAINER, archive it with keys/ and uploads/ as $DEST/$NAME${RECIPIENT:+.age}, and delete archives older than $KEEP_DAYS days"
  exit 0
fi

run install -d -m 700 "$DEST"
if [ -e "$DEST/$NAME" ] || [ -e "$DEST/$NAME.age" ]; then die "$DEST/$NAME already exists. Wait a second and run it again."; fi
WORK=$(mktemp -d "$DEST/.backup-XXXXXX")
cleanup() {
  rm -rf "$WORK"
  docker exec "$CONTAINER" sh -c 'rm -rf "${DATA_DIR:-/data}/.nil-snapshot"' > /dev/null 2>&1 || true
}
trap cleanup EXIT

step "Snapshot and check the database"
summary=$(docker exec "$CONTAINER" node --disable-warning=ExperimentalWarning -e "$SNAPSHOT_SCRIPT")
log "checked: $summary"
expected=$(sed -n 's/.*"sha256":"\([0-9a-f]*\)".*/\1/p' <<< "$summary")
[ -n "$expected" ] || die "The snapshot didn't report its checksum."

step "Archive the copy, the keys and the uploads"
mkdir -m 700 "$WORK/data"
# only what a restore needs: never the live database files, scratch copies or the setup token
docker exec "$CONTAINER" sh -c 'cd "${DATA_DIR:-/data}" && tar -cf - .nil-snapshot/nonos.db $(ls -d keys uploads 2> /dev/null)' | tar -xf - -C "$WORK/data"
mv "$WORK/data/.nil-snapshot/nonos.db" "$WORK/data/nonos.db"
rmdir "$WORK/data/.nil-snapshot"
[ "$(sha256sum "$WORK/data/nonos.db" | cut -d' ' -f1)" = "$expected" ] || die "The database that arrived isn't the one that was checked."
[ -f "$WORK/data/keys/receipts-ed25519.pem" ] || warn "There is no signing key in DATA_DIR/keys yet. That's normal before the workspace is set up."
tar -C "$WORK/data" -czf "$WORK/$NAME" .
tar -tzf "$WORK/$NAME" > /dev/null

if [ -n "$RECIPIENT" ]; then
  age -r "$RECIPIENT" -o "$WORK/$NAME.age" "$WORK/$NAME"
  NAME="$NAME.age"
fi
install -m 600 "$WORK/$NAME" "$DEST/$NAME"
log "wrote $DEST/$NAME"

step "Prune"
find "$DEST" -maxdepth 1 -name 'nil-*.tar.gz*' -mtime +"$KEEP_DAYS" -print -delete
[ -n "$RECIPIENT" ] || log "The archive is not encrypted. Encrypt it (age, gpg, restic) before it leaves this server."
