import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import folderAccess from '../services/folderAccess.js';
import grantFolderKeys from '../services/grantFolderKeys.js';
import announceFolder from '../services/announceFolder.js';
import dropBlobs from '../services/dropBlobs.js';
import keptBytes from '../services/keptBytes.js';
import toFolder from '../mappers/toFolder.js';
import toFolderItem from '../mappers/toFolderItem.js';
import contentWrites from '../auth/contentWrites.js';

const router = express.Router();
// a wrapped item key: a 12-byte IV, the 32-byte key and its 16-byte tag, as base64url
const ITEM_KEY = 80;
const NAME = { max: 4000 };

const manager = (folder, user) => folder.created_by === user.id || user.isAdmin;
const readers = (folderId) => sql.all('SELECT user_id FROM folder_keys WHERE folder_id = ?', folderId).map((r) => r.user_id);
const shown = (folderId, user) => {
  const { folder, wrappedKey } = folderAccess(folderId, user);
  return toFolder(folder, wrappedKey, readers(folder.id));
};
const baseVersion = (folder, value) => {
  if (check.number(value, 'Version', { min: 1, integer: true }) !== folder.version) throw new HttpError(409, 'Someone changed this folder in the meantime.');
};
const keepSelf = (grants, user) => {
  if (!Array.isArray(grants) || !grants.some((g) => g?.userId === user.id)) throw HttpError.badRequest('Keep a key for yourself, or you couldn’t open your own folder.');
  return grants;
};

// Your shared folders, the team folders still waiting for a key to reach you, and the space your
// files take up against your quota.
router.get(
  '/folders',
  route((req) => {
    const mine = sql.all('SELECT f.*, k.wrapped_key FROM folders f JOIN folder_keys k ON k.folder_id = f.id AND k.user_id = ? ORDER BY f.updated_at DESC', req.user.id);
    const waiting = sql.all(
      "SELECT f.id, f.created_by, f.updated_at FROM folders f WHERE f.audience = 'team' AND NOT EXISTS (SELECT 1 FROM folder_keys k WHERE k.folder_id = f.id AND k.user_id = ?) ORDER BY f.updated_at DESC",
      req.user.id,
    );
    const quota = req.user.role === 'guest' ? config.uploads.guestQuotaBytes : config.uploads.memberQuotaBytes;
    return {
      folders: mine.map((row) => toFolder(row, row.wrapped_key, readers(row.id))),
      waiting: waiting.map((f) => ({ id: f.id, createdBy: f.created_by, updatedAt: f.updated_at })),
      usage: { used: keptBytes(req.user.id), quota, maxFile: config.sealedBlobs.maxFileBytes },
    };
  }),
);

// A folder with everything inside it. The id may be the folder's or one of its subfolders', so a
// link to a subfolder opens with its whole folder.
router.get(
  '/folders/:id',
  route((req) => {
    const top = sql.get("SELECT folder_id FROM folder_items WHERE id = ? AND kind = 'folder'", req.params.id)?.folder_id ?? req.params.id;
    const folder = shown(top, req.user);
    const blobs = new Map(sql.all("SELECT * FROM sealed_blobs WHERE scope_kind = 'folder' AND scope_id = ? AND finished_at IS NOT NULL", folder.id).map((b) => [b.id, b]));
    const items = sql.all('SELECT * FROM folder_items WHERE folder_id = ? ORDER BY created_at', folder.id).map((row) => toFolderItem(row, blobs));
    return { folder, items };
  }),
);

router.post(
  '/folders',
  contentWrites,
  route((req) => {
    const b = req.body ?? {};
    const grants = keepSelf(b.grants, req.user);
    const id = check.text(b.id, 'Folder id', { min: 16, max: 32 });
    if (!/^[A-Za-z0-9_-]+$/.test(id) || sql.get('SELECT 1 FROM folders WHERE id = ?', id) || sql.get('SELECT 1 FROM folder_items WHERE id = ?', id)) throw HttpError.badRequest('Pick a fresh folder id.');
    const now = Date.now();
    sql.tx(() => {
      sql.run(
        'INSERT INTO folders (id, name_ct, audience, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, cipherText(b.nameCt, 'Name', NAME), check.oneOf(b.audience ?? 'team', ['team', 'people'], 'Audience'), req.user.id, req.user.id, now, now,
      );
      grantFolderKeys(id, grants, req.user.id);
    });
    announceFolder(id);
    return { folder: shown(id, req.user) };
  }),
);

// A new name, signed by whoever gave it. Like a doc save, it starts from the version it renames.
router.put(
  '/folders/:id',
  contentWrites,
  route((req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    baseVersion(folder, req.body?.baseVersion);
    sql.run('UPDATE folders SET name_ct = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?', cipherText(req.body?.nameCt, 'Name', NAME), req.user.id, Date.now(), folder.id);
    announceFolder(folder.id);
    return { folder: shown(folder.id, req.user) };
  }),
);

router.post(
  '/folders/:id/grants',
  route((req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    if (folder.audience === 'people' && !manager(folder, req.user)) throw HttpError.forbidden('Only the folder’s creator or an admin can share it with more people.');
    grantFolderKeys(folder.id, req.body?.grants, req.user.id);
    announceFolder(folder.id);
    return { readers: readers(folder.id) };
  }),
);

// Taking someone out: a fresh folder key sealed for whoever stays, the name signed again, and
// every file's and subfolder's key wrapped under the new key, all at once or not at all. The
// files themselves don't change.
router.post(
  '/folders/:id/rotate',
  contentWrites,
  route((req) => {
    const b = req.body ?? {};
    const { folder } = folderAccess(req.params.id, req.user);
    if (!manager(folder, req.user)) throw HttpError.forbidden('Only the folder’s creator or an admin can remove people.');
    baseVersion(folder, b.baseVersion);
    const grants = keepSelf(b.grants, req.user);
    const ids = sql.all('SELECT id FROM folder_items WHERE folder_id = ?', folder.id).map((r) => r.id);
    const wraps = new Map((Array.isArray(b.items) ? b.items : []).map((i) => [i?.id, i?.keyWrap]));
    if (wraps.size !== ids.length || !ids.every((id) => wraps.has(id))) throw new HttpError(409, 'The folder changed while its key was being replaced. Try again.');
    for (const id of ids) cipherText(wraps.get(id), 'Wrapped key', { exact: ITEM_KEY });
    const before = readers(folder.id);
    sql.tx(() => {
      sql.run(
        'UPDATE folders SET name_ct = ?, audience = ?, version = version + 1, key_rev = key_rev + 1, updated_by = ?, updated_at = ? WHERE id = ?',
        cipherText(b.nameCt, 'Name', NAME), check.oneOf(b.audience ?? folder.audience, ['team', 'people'], 'Audience'), req.user.id, Date.now(), folder.id,
      );
      for (const id of ids) sql.run('UPDATE folder_items SET key_wrap = ? WHERE id = ?', wraps.get(id), id);
      grantFolderKeys(folder.id, grants, req.user.id, { replace: true });
    });
    announceFolder(folder.id, before);
    return { readers: readers(folder.id) };
  }),
);

router.delete(
  '/folders/:id',
  route(async (req) => {
    const { folder } = folderAccess(req.params.id, req.user);
    if (!manager(folder, req.user)) throw HttpError.forbidden('Only the folder’s creator or an admin can delete it.');
    const before = readers(folder.id);
    const blobs = sql.all("SELECT id FROM sealed_blobs WHERE scope_kind = 'folder' AND scope_id = ?", folder.id).map((r) => r.id);
    sql.run('DELETE FROM folders WHERE id = ?', folder.id);
    await dropBlobs(blobs);
    announceFolder(folder.id, before);
    return { ok: true };
  }),
);

export default router;
