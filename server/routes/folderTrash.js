import express from 'express';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import sql from '../db/sql.js';
import folderAccess from '../services/folderAccess.js';
import folderManager from '../services/folderManager.js';
import announceFolder from '../services/announceFolder.js';
import folderTrash from '../services/folderTrash.js';
import itemPlace from '../services/itemPlace.js';
import shownItem from '../services/shownItem.js';
import fileDeletes from '../auth/fileDeletes.js';
import contentWrites from '../auth/contentWrites.js';

const router = express.Router();
const META = { max: 16_000 };

// Who may take something out of the trash or delete it for good: whoever deleted it, whoever
// added all of it, or someone who manages the folder.
function mayHandle(folder, user, item) {
  if (item.deleted_by === user.id || folderManager(folder, user)) return;
  itemPlace.mayRemove(folder, user, item);
}

// Brings back something deleted, with everything that went with it, where it was. When the folder
// it was in is in the trash too, the browser names another place and signs the details again for
// it, as for a move.
router.post(
  '/folders/:id/items/:itemId/restore',
  contentWrites,
  route((req) => {
    const b = req.body ?? {};
    const { folder } = folderAccess(req.params.id, req.user);
    const item = itemPlace.trashed(folder, req.params.itemId);
    mayHandle(folder, req.user, item);
    const home = item.parent_id && sql.get('SELECT 1 FROM folder_items WHERE id = ? AND deleted_at IS NULL', item.parent_id);
    if (b.metaCt === undefined) {
      if (item.parent_id && !home) throw new HttpError(409, 'The folder this was in is in the trash too. Restore that first, or put this somewhere else.');
      folderTrash.restore(item);
    } else {
      if (b.keyRev !== folder.key_rev) throw new HttpError(409, 'This folder got a new key meanwhile. Try again.');
      if (item.key_rev < folder.reseal_rev) throw new HttpError(409, 'This is being encrypted again after someone was taken out of the folder. Try again in a moment.');
      const parent = itemPlace.parent(folder, b.parentId, item.id);
      const metaCt = cipherText(b.metaCt, 'Details', META);
      sql.tx(() => {
        folderTrash.restore(item, parent);
        sql.run('UPDATE folder_items SET meta_ct = ?, updated_by = ?, updated_at = ? WHERE id = ?', metaCt, req.user.id, Date.now(), item.id);
      });
    }
    announceFolder(folder.id);
    return { item: shownItem(item.id) };
  }),
);

// Deletes something in the trash for good, with its blobs. This can't be undone.
router.delete(
  '/folders/:id/trash/:itemId',
  fileDeletes,
  route(async (req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    const item = itemPlace.trashed(folder, req.params.itemId);
    mayHandle(folder, req.user, item);
    await folderTrash.forever(item);
    announceFolder(folder.id);
    return { ok: true };
  }),
);

export default router;
