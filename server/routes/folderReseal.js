import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import folderAccess from '../services/folderAccess.js';
import announceFolder from '../services/announceFolder.js';
import dropBlobs from '../services/dropBlobs.js';
import itemBlobs from '../services/itemBlobs.js';
import shownItem from '../services/shownItem.js';
import reseals from '../auth/reseals.js';

const router = express.Router();
// a wrapped item key: a 12-byte IV, the 32-byte key and its 16-byte tag, as base64url
const ITEM_KEY = 80;
const META = { max: 16_000 };
const given = (value) => value !== undefined && value !== null;

// After someone is taken out of a folder, the browsers of the people who stay encrypt every file
// in it again under a fresh key of its own, and its details with it. The server only keeps track:
// which items still wait, which browser is on which, and the swap from the old blobs to the new.
// It never sees a key or a byte of a file.

// Hands this browser a few waiting items nobody else is on, or whose turn ran out, and says how
// many wait in all. They're this person's for FILES_RESEAL_LEASE_MINUTES.
router.post(
  '/folders/:id/reseal/claim',
  reseals,
  route((req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    const now = Date.now();
    const left = sql.get('SELECT COUNT(*) AS n FROM folder_items WHERE folder_id = ? AND key_rev < ?', folder.id, folder.reseal_rev).n;
    const ids = sql
      .all('SELECT id FROM folder_items WHERE folder_id = ? AND key_rev < ? AND (reseal_until IS NULL OR reseal_until < ? OR reseal_by = ?) ORDER BY created_at LIMIT ?', folder.id, folder.reseal_rev, now, req.user.id, config.files.resealBatch)
      .map((r) => r.id);
    sql.tx(() => {
      for (const id of ids) sql.run('UPDATE folder_items SET reseal_by = ?, reseal_until = ? WHERE id = ?', req.user.id, now + config.files.resealLeaseMs, id);
    });
    return { items: ids, left };
  }),
);

// Swaps in an item encrypted again: its key wrapped under the folder key as it is now, its details
// signed again, and for a file the fresh copies of its blobs. A thumbnail that couldn't be checked
// may be left behind, and a file that had no chunk list may gain one. The old blobs go at once.
router.post(
  '/folders/:id/items/:itemId/reseal',
  reseals,
  route(async (req) => {
    const b = req.body ?? {};
    const { folder } = folderAccess(req.params.id, req.user);
    const item = typeof req.params.itemId === 'string' ? sql.get('SELECT * FROM folder_items WHERE id = ? AND folder_id = ?', req.params.itemId, folder.id) : null;
    if (!item) throw HttpError.notFound('That file');
    if (item.key_rev >= folder.reseal_rev) throw new HttpError(409, 'This was encrypted again already.');
    if (b.keyRev !== folder.key_rev) throw new HttpError(409, 'This folder got a new key while you were encrypting it again. Try again.');
    const keyWrap = cipherText(b.keyWrap, 'Wrapped key', { exact: ITEM_KEY });
    const metaCt = cipherText(b.metaCt, 'Details', META);
    let blob = null;
    let thumb = null;
    let hashes = null;
    if (item.kind === 'file') {
      blob = itemBlobs.copy(folder, req.user, b.blobId, item.blob_id);
      if (given(b.thumbId)) thumb = item.thumb_id ? itemBlobs.copy(folder, req.user, b.thumbId, item.thumb_id) : null;
      // a chunk list comes as a copy of the old one, or made afresh from the file as it was read
      const copyOf = given(b.hashesId) ? sql.get('SELECT replaces FROM sealed_blobs WHERE id = ?', String(b.hashesId))?.replaces : null;
      if (given(b.hashesId)) hashes = item.hashes_id && copyOf === item.hashes_id ? itemBlobs.copy(folder, req.user, b.hashesId, item.hashes_id) : itemBlobs.hashes(folder, req.user, b.hashesId, blob);
      if (given(b.thumbId) && !thumb) throw HttpError.badRequest('This file has no thumbnail to replace.');
    } else if (given(b.blobId) || given(b.thumbId) || given(b.hashesId)) throw HttpError.badRequest('A folder holds no file of its own.');
    const old = [item.blob_id, item.thumb_id, item.hashes_id].filter(Boolean);
    const copies = [blob, thumb, hashes].filter(Boolean);
    const others = old.flatMap((id) => sql.all('SELECT id FROM sealed_blobs WHERE replaces = ?', id).map((r) => r.id)).filter((id) => !copies.some((c) => c.id === id));
    const now = Date.now();
    sql.tx(() => {
      sql.run(
        'UPDATE folder_items SET blob_id = ?, thumb_id = ?, hashes_id = ?, key_wrap = ?, meta_ct = ?, key_rev = ?, reseal_by = NULL, reseal_until = NULL, updated_by = ?, updated_at = ? WHERE id = ?',
        blob?.id ?? null, thumb?.id ?? null, hashes?.id ?? null, keyWrap, metaCt, folder.key_rev, req.user.id, now, item.id,
      );
      // a copy counts against the quota of whoever uploaded the original
      for (const copy of copies.filter((c) => c.replaces)) sql.run('UPDATE sealed_blobs SET replaces = NULL, uploader_id = (SELECT uploader_id FROM sealed_blobs WHERE id = ?), updated_at = ? WHERE id = ?', copy.replaces, now, copy.id);
    });
    await dropBlobs([...old, ...others]);
    announceFolder(folder.id);
    return { item: shownItem(item.id) };
  }),
);

export default router;
