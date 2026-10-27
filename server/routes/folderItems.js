import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import folderAccess from '../services/folderAccess.js';
import announceFolder from '../services/announceFolder.js';
import folderTrash from '../services/folderTrash.js';
import shownItem from '../services/shownItem.js';
import itemBlobs from '../services/itemBlobs.js';
import folderDepth from '../services/folderDepth.js';
import itemPlace from '../services/itemPlace.js';
import contentWrites from '../auth/contentWrites.js';
import fileDeletes from '../auth/fileDeletes.js';

const router = express.Router();
// a wrapped item key: a 12-byte IV, the 32-byte key and its 16-byte tag, as base64url
const ITEM_KEY = 80;
const META = { max: 16_000 };

const given = (value) => value !== undefined && value !== null;

// Each file added needs a blob of its own, and starting those is limited already; subfolders count
// as content writes, like docs saved, so a script can't fill a folder with them.
const newFolders = (req, res, next) => (req.body?.kind === 'file' ? next() : contentWrites(req, res, next));

// Adds a file whose blob is already uploaded, or a subfolder. Its key is wrapped under the folder
// key the browser had; if the folder has moved to a new key since, it's refused so nobody is left
// with a file they can't open.
router.post(
  '/folders/:id/items',
  newFolders,
  route((req) => {
    const b = req.body ?? {};
    const { folder } = folderAccess(req.params.id, req.user);
    if (b.keyRev !== folder.key_rev) throw new HttpError(409, 'This folder got a new key while you were adding to it. Try again.');
    const id = check.text(b.id, 'Item id', { min: 16, max: 32 });
    if (!/^[A-Za-z0-9_-]+$/.test(id) || sql.get('SELECT 1 FROM folder_items WHERE id = ?', id) || sql.get('SELECT 1 FROM folders WHERE id = ?', id)) throw HttpError.badRequest('Pick a fresh id.');
    const kind = check.oneOf(b.kind, ['file', 'folder'], 'Kind');
    if (sql.get('SELECT COUNT(*) AS n FROM folder_items WHERE folder_id = ?', folder.id).n >= config.sealedBlobs.folderItemsMax) throw new HttpError(413, 'This folder is full. Start another one.');
    const parent = itemPlace.parent(folder, b.parentId);
    folderDepth.check(parent);
    if (kind === 'folder' && (b.blobId || b.thumbId || b.hashesId)) throw HttpError.badRequest('A folder holds no file of its own.');
    const blob = kind === 'file' ? itemBlobs.own(folder, req.user, b.blobId) : null;
    const thumb = blob && given(b.thumbId) ? itemBlobs.thumb(folder, req.user, b.thumbId) : null;
    const hashes = blob && given(b.hashesId) ? itemBlobs.hashes(folder, req.user, b.hashesId, blob) : null;
    const ids = [blob, thumb, hashes].filter(Boolean).map((x) => x.id);
    if (new Set(ids).size !== ids.length) throw HttpError.badRequest('A thumbnail is a file of its own.');
    const now = Date.now();
    sql.run(
      'INSERT INTO folder_items (id, folder_id, parent_id, kind, blob_id, thumb_id, hashes_id, key_rev, key_wrap, meta_ct, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, folder.id, parent, kind, blob?.id ?? null, thumb?.id ?? null, hashes?.id ?? null, folder.key_rev, cipherText(b.keyWrap, 'Wrapped key', { exact: ITEM_KEY }), cipherText(b.metaCt, 'Details', META), req.user.id, req.user.id, now, now,
    );
    sql.run('UPDATE folders SET updated_at = ? WHERE id = ?', now, folder.id);
    announceFolder(folder.id);
    return { item: shownItem(id) };
  }),
);

// A new name or place, signed again by whoever changed it, under the folder key as it is now. Only
// whoever added it, or someone who manages the folder, may change it. The key and the file stay
// as they are.
router.patch(
  '/folders/:id/items/:itemId',
  contentWrites,
  route((req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    const item = itemPlace.item(folder, req.params.itemId);
    itemPlace.mayChange(folder, req.user, item);
    if (req.body?.keyRev !== folder.key_rev) throw new HttpError(409, 'This folder got a new key while you were changing this. Try again.');
    // its key is one someone taken out may hold, so new details wait for a fresh key
    if (item.key_rev < folder.reseal_rev) throw new HttpError(409, 'This is being encrypted again after someone was taken out of the folder. Try again in a moment.');
    const parent = itemPlace.parent(folder, req.body?.parentId, item.id);
    if (parent !== item.parent_id) folderDepth.check(parent, folderDepth.levels(item.id));
    const now = Date.now();
    sql.run('UPDATE folder_items SET parent_id = ?, meta_ct = ?, updated_by = ?, updated_at = ? WHERE id = ?', parent, cipherText(req.body?.metaCt, 'Details', META), req.user.id, now, item.id);
    sql.run('UPDATE folders SET updated_at = ? WHERE id = ?', now, folder.id);
    announceFolder(folder.id);
    return { item: shownItem(item.id) };
  }),
);

// Puts a file or folder in the folder's trash, with everything in it. Whoever added all of it, or
// someone who manages the folder, may.
router.delete(
  '/folders/:id/items/:itemId',
  fileDeletes,
  route((req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    const item = itemPlace.item(folder, req.params.itemId);
    itemPlace.mayRemove(folder, req.user, item);
    folderTrash.put([item], req.user);
    announceFolder(folder.id);
    return { ok: true };
  }),
);

export default router;
