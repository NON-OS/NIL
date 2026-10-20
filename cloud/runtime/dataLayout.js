// What the control plane knows about a Nil data directory (DATA_DIR, /data in the image):
// file names only. It never opens the database or reads a file's contents to decide anything.
const DB = 'nonos.db';
const SNAPSHOT = '.nil-snapshot';
const CHECKPOINT = '.nil-checkpoint';
const MANIFEST = '.nil-cloud.json';
// Scratch folders the app makes while writing or reading a capsule, and the app's own
// pre-migration copies of the database. Those copies are for rolling back on this server; in a
// backup they would only multiply its size and keep rows that retention has since erased.
const SCRATCH = /^((capsule|restore)-[^/]*(\/|$)|pre-migration-[^/]*\.db$)/;

const inside = (name, dir) => name === dir || name.startsWith(`${dir}/`);

function safe(entry) {
  const { name, type } = entry;
  if (name.startsWith('/') || name.split('/').includes('..') || /[\0-\x1f\\]/.test(name)) throw new Error(`Unsafe path in backup: ${JSON.stringify(name)}`);
  if (type !== 'file' && type !== 'dir') throw new Error(`Backups may only hold files and folders, not ${type} entries (${name}).`);
}

const dataLayout = {
  // the image sets DATA_DIR=/data (see the root Dockerfile)
  mount: '/data',
  db: DB,
  snapshotDir: SNAPSHOT,
  checkpointDir: CHECKPOINT,
  manifest: MANIFEST,

  // For an archive of /data, whose entries start with "data/". A running workspace's database
  // files are mid-write, so they are swapped for the consistent copy made with VACUUM INTO. A
  // stopped workspace's files are already consistent: the database and its WAL go as they are.
  exportDecide: (live) => (entry) => {
    if (entry.name !== 'data' && !entry.name.startsWith('data/')) throw new Error(`Unexpected path in data archive: ${entry.name}`);
    const name = entry.name.slice(5);
    if (!name || SCRATCH.test(name) || inside(name, CHECKPOINT) || name === `${DB}-shm`) return null;
    if (live) {
      if (name === `${SNAPSHOT}/${DB}`) return DB;
      if (name === DB || name === `${DB}-wal` || inside(name, SNAPSHOT)) return null;
    } else if (inside(name, SNAPSHOT)) {
      return null;
    }
    return name;
  },

  // By the time a backup gets here its encryption has been checked, so it wasn't cut short or
  // changed after it was sealed. That proves nothing about who sealed it: backups are sealed to a
  // public key, so anyone who can write to the backup storage can seal one of their own, with any
  // owner, name and database in it. So these checks don't trust the contents: only plain files and
  // folders below /data, never links or devices, and no leftovers from the app's scratch work.
  restoreDecide: (entry) => {
    if (!entry.name || entry.name === MANIFEST) return null;
    safe(entry);
    if (SCRATCH.test(entry.name) || inside(entry.name, CHECKPOINT) || inside(entry.name, SNAPSHOT) || entry.name === `${DB}-shm`) return null;
    return entry.name;
  },

  // Archives of /data/nonos.db and /data/nonos.db-wal, taken while the workspace is stopped.
  checkpointDecide: (entry) => ([DB, `${DB}-wal`].includes(entry.name) && entry.type === 'file' ? `${CHECKPOINT}/${entry.name}` : null),

  // The archive of /data/.nil-checkpoint, put back in place of the live database files.
  rollbackDecide: (entry) => {
    const name = entry.name.slice(CHECKPOINT.length + 1);
    return inside(entry.name, CHECKPOINT) && [DB, `${DB}-wal`].includes(name) && entry.type === 'file' ? name : null;
  },
};

export default dataLayout;
