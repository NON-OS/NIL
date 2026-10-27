import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import folderAccess from '../services/folderAccess.js';
import announceFolder from '../services/announceFolder.js';
import folderTrash from '../services/folderTrash.js';
import itemPlace from '../services/itemPlace.js';
import folderDepth from '../services/folderDepth.js';
import shownItem from '../services/shownItem.js';
import contentWrites from '../auth/contentWrites.js';
import fileDeletes from '../auth/fileDeletes.js';

const router = express.Router();
const META = { max: 16_000 };

// The items a bulk request names: a list of up to FILES_BULK_MAX, each in this folder, no repeats.
function listed(folder, list, idOf) {
  if (!Array.isArray(list) || !list.length) throw HttpError.badRequest('Pick something first.');
  if (list.length > config.files.bulkMax) throw new HttpError(413, `Pick at most ${config.files.bulkMax} at a time.`);
  const items = list.map((entry) => itemPlace.item(folder, idOf(entry)));
  if (new Set(items.map((i) => i.id)).size !== items.length) throw HttpError.badRequest('That names something twice.');
  return items;
}

// Moves several files and folders into one folder at once, each one this person may move. Each
// one's details are signed again by whoever moves them, as for a single move, under the folder key
// as it is now, and the server takes all of them or none.
router.post(
  '/folders/:id/items/move',
  contentWrites,
  route((req) => {
    const b = req.body ?? {};
    const { folder } = folderAccess(req.params.id, req.user);
    const items = listed(folder, b.items, (entry) => entry?.id);
    const metas = b.items.map((entry) => cipherText(entry?.metaCt, 'Details', META));
    if (b.keyRev !== folder.key_rev) throw new HttpError(409, 'This folder got a new key while you were moving these. Try again.');
    const parent = itemPlace.parent(folder, b.parentId);
    for (const item of items) {
      itemPlace.mayChange(folder, req.user, item);
      if (item.key_rev < folder.reseal_rev) throw new HttpError(409, 'Some of these are being encrypted again after someone was taken out of the folder. Try again in a moment.');
      itemPlace.parent(folder, parent, item.id);
      if (parent !== item.parent_id) folderDepth.check(parent, folderDepth.levels(item.id));
    }
    const now = Date.now();
    sql.tx(() => {
      items.forEach((item, i) => sql.run('UPDATE folder_items SET parent_id = ?, meta_ct = ?, updated_by = ?, updated_at = ? WHERE id = ?', parent, metas[i], req.user.id, now, item.id));
      sql.run('UPDATE folders SET updated_at = ? WHERE id = ?', now, folder.id);
    });
    announceFolder(folder.id);
    return { items: items.map((i) => shownItem(i.id)) };
  }),
);

// Puts several files and folders in the trash at once, each with everything inside it. Only when
// this person may delete every one of them (see itemPlace.mayRemove). Something inside another
// one picked goes with it.
router.post(
  '/folders/:id/items/remove',
  fileDeletes,
  route((req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    const items = listed(folder, req.body?.ids, (id) => id);
    for (const item of items) itemPlace.mayRemove(folder, req.user, item);
    const inside = new Set(items.flatMap((i) => itemPlace.under(i).filter((u) => u.id !== i.id).map((u) => u.id)));
    folderTrash.put(items.filter((i) => !inside.has(i.id)), req.user);
    announceFolder(folder.id);
    return { ok: true };
  }),
);

export default router;
