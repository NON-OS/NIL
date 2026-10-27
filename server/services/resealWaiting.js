import sql from '../db/sql.js';

// Whether a finished blob is still waiting to be encrypted again under a fresh key, after someone
// was taken out of its doc or folder: a doc's blob says so itself; a folder's is waiting while the
// file, thumbnail or chunk list it belongs to has an own key older than the folder's last removal.
export default function resealWaiting(blob) {
  if (blob.scope_kind === 'doc') return blob.reseal === 1;
  return Boolean(
    sql.get(
      'SELECT 1 FROM folder_items i JOIN folders f ON f.id = i.folder_id WHERE (i.blob_id = ? OR i.thumb_id = ? OR i.hashes_id = ?) AND i.key_rev < f.reseal_rev',
      blob.id, blob.id, blob.id,
    ),
  );
}
