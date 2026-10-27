import sql from '../db/sql.js';
import config from '../config.js';
import dropBlobs from './dropBlobs.js';
import itemPlace from './itemPlace.js';

// A shared folder's trash. Deleting a file or folder marks it, and everything in it, with when and
// by whom, and with the item that was deleted, so restoring that brings the same things back.
// Nothing in the trash is shown in the folder or can be changed, but it keeps its keys and is
// encrypted again with everything else when someone is taken out. After FILES_TRASH_DAYS, or when
// someone deletes it for good, it's gone with its blobs.
const folderTrash = {
  put(items, user, now = Date.now()) {
    sql.tx(() => {
      for (const item of items) {
        for (const row of itemPlace.under(item)) sql.run('UPDATE folder_items SET deleted_at = ?, deleted_by = ?, trash_root = ? WHERE id = ?', now, user.id, item.id, row.id);
      }
    });
  },

  restore(item, parent) {
    sql.tx(() => {
      sql.run('UPDATE folder_items SET deleted_at = NULL, deleted_by = NULL, trash_root = NULL WHERE trash_root = ?', item.id);
      if (parent !== undefined) sql.run('UPDATE folder_items SET parent_id = ? WHERE id = ?', parent, item.id);
    });
  },

  // Gone for good: the item and everything that was ever inside it, with their blobs.
  async forever(item) {
    const blobs = itemPlace.blobsUnder(item.id);
    sql.run('DELETE FROM folder_items WHERE id = ?', item.id);
    await dropBlobs(blobs);
  },

  // what has been in the trash longer than FILES_TRASH_DAYS
  async purge(now = Date.now()) {
    const old = sql.all('SELECT * FROM folder_items WHERE deleted_at < ? AND trash_root = id', now - config.files.trashMs);
    for (const item of old) await folderTrash.forever(item);
    return old.length;
  },
};

export default folderTrash;
