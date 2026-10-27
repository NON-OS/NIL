import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import folderAccess from '../services/folderAccess.js';
import announceFolder from '../services/announceFolder.js';
import dropBlobs from '../services/dropBlobs.js';
import toFolderItem from '../mappers/toFolderItem.js';
import contentWrites from '../auth/contentWrites.js';

const router = express.Router();
// a wrapped item key: a 12-byte IV, the 32-byte key and its 16-byte tag, as base64url
const ITEM_KEY = 80;
const META = { max: 16_000 };

function itemOf(folder, id) {
  const item = typeof id === 'string' ? sql.get('SELECT * FROM folder_items WHERE id = ? AND folder_id = ?', id, folder.id) : null;
  if (!item) throw HttpError.notFound('That file');
  return item;
}

// Where an item may go: straight into the folder (null) or into one of its subfolders, never
// into itself or anything inside it.
function parentFor(folder, value, moving = null) {
  if (value === null || value === undefined) return null;
  const parent = sql.get("SELECT id, parent_id FROM folder_items WHERE id = ? AND folder_id = ? AND kind = 'folder'", typeof value === 'string' ? value : '', folder.id);
  if (!parent) throw HttpError.badRequest('That folder isn’t in this shared folder.');
  for (let at = parent; at; at = at.parent_id ? sql.get('SELECT id, parent_id FROM folder_items WHERE id = ?', at.parent_id) : null) {
    if (at.id === moving) throw HttpError.badRequest('A folder can’t go inside itself.');
  }
  return parent.id;
}

// A blob this person uploaded to this folder, finished, and not yet any other file's.
function ownBlob(folder, user, id) {
  const blob = sql.get("SELECT * FROM sealed_blobs WHERE id = ? AND scope_kind = 'folder' AND scope_id = ? AND uploader_id = ? AND finished_at IS NOT NULL", typeof id === 'string' ? id : '', folder.id, user.id);
  if (!blob || sql.get('SELECT 1 FROM folder_items WHERE blob_id = ? OR thumb_id = ?', blob.id, blob.id)) throw HttpError.badRequest('Upload the file before adding it.');
  return blob;
}

function shown(id) {
  const row = sql.get('SELECT * FROM folder_items WHERE id = ?', id);
  const blobs = new Map([row.blob_id, row.thumb_id].filter(Boolean).map((b) => [b, sql.get('SELECT * FROM sealed_blobs WHERE id = ?', b)]));
  return toFolderItem(row, blobs);
}

// Adds a file whose blob is already uploaded, or a subfolder. Its key is wrapped under the folder
// key the browser had; if the folder has moved to a new key since, it's refused so nobody is left
// with a file they can't open.
router.post(
  '/folders/:id/items',
  contentWrites,
  route((req) => {
    const b = req.body ?? {};
    const { folder } = folderAccess(req.params.id, req.user);
    if (b.keyRev !== folder.key_rev) throw new HttpError(409, 'This folder got a new key while you were adding to it. Try again.');
    const id = check.text(b.id, 'Item id', { min: 16, max: 32 });
    if (!/^[A-Za-z0-9_-]+$/.test(id) || sql.get('SELECT 1 FROM folder_items WHERE id = ?', id) || sql.get('SELECT 1 FROM folders WHERE id = ?', id)) throw HttpError.badRequest('Pick a fresh id.');
    const kind = check.oneOf(b.kind, ['file', 'folder'], 'Kind');
    if (sql.get('SELECT COUNT(*) AS n FROM folder_items WHERE folder_id = ?', folder.id).n >= config.sealedBlobs.folderItemsMax) throw new HttpError(413, 'This folder is full. Start another one.');
    const parent = parentFor(folder, b.parentId);
    const blob = kind === 'file' ? ownBlob(folder, req.user, b.blobId) : null;
    const thumb = kind === 'file' && b.thumbId !== undefined && b.thumbId !== null ? ownBlob(folder, req.user, b.thumbId) : null;
    if (kind === 'folder' && (b.blobId || b.thumbId)) throw HttpError.badRequest('A folder holds no file of its own.');
    if (thumb && thumb.id === blob.id) throw HttpError.badRequest('A thumbnail is a file of its own.');
    const now = Date.now();
    sql.run(
      'INSERT INTO folder_items (id, folder_id, parent_id, kind, blob_id, thumb_id, key_wrap, meta_ct, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, folder.id, parent, kind, blob?.id ?? null, thumb?.id ?? null, cipherText(b.keyWrap, 'Wrapped key', { exact: ITEM_KEY }), cipherText(b.metaCt, 'Details', META), req.user.id, req.user.id, now, now,
    );
    sql.run('UPDATE folders SET updated_at = ? WHERE id = ?', now, folder.id);
    announceFolder(folder.id);
    return { item: shown(id) };
  }),
);

// A new name or place, signed again by whoever changed it. The key and the file stay as they are.
router.patch(
  '/folders/:id/items/:itemId',
  contentWrites,
  route((req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    const item = itemOf(folder, req.params.itemId);
    const parent = parentFor(folder, req.body?.parentId, item.id);
    const now = Date.now();
    sql.run('UPDATE folder_items SET parent_id = ?, meta_ct = ?, updated_by = ?, updated_at = ? WHERE id = ?', parent, cipherText(req.body?.metaCt, 'Details', META), req.user.id, now, item.id);
    sql.run('UPDATE folders SET updated_at = ? WHERE id = ?', now, folder.id);
    announceFolder(folder.id);
    return { item: shown(item.id) };
  }),
);

// Whoever added a file or folder, or an admin, may delete it. A folder goes with everything in it.
router.delete(
  '/folders/:id/items/:itemId',
  route(async (req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    const item = itemOf(folder, req.params.itemId);
    if (item.created_by !== req.user.id && !req.user.isAdmin) throw HttpError.forbidden('Only whoever added this, or an admin, can delete it.');
    const gone = sql.all(
      'WITH RECURSIVE under(id) AS (SELECT ? UNION SELECT i.id FROM folder_items i JOIN under ON i.parent_id = under.id) SELECT blob_id, thumb_id FROM folder_items WHERE id IN (SELECT id FROM under)',
      item.id,
    );
    sql.run('DELETE FROM folder_items WHERE id = ?', item.id);
    await dropBlobs(gone.flatMap((r) => [r.blob_id, r.thumb_id]).filter(Boolean));
    announceFolder(folder.id);
    return { ok: true };
  }),
);

export default router;
