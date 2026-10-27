import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import folderManager from './folderManager.js';

const UNDER = 'WITH RECURSIVE under(id) AS (SELECT ? UNION SELECT i.id FROM folder_items i JOIN under ON i.parent_id = under.id)';

// Finding a file or subfolder in a shared folder, where one may go, and who may change it. Things
// in the folder's trash are found only as trash.
const itemPlace = {
  item(folder, id) {
    const item = typeof id === 'string' ? sql.get('SELECT * FROM folder_items WHERE id = ? AND folder_id = ? AND deleted_at IS NULL', id, folder.id) : null;
    if (!item) throw HttpError.notFound('That file');
    return item;
  },

  // something deleted on its own, as it sits in the trash with what went with it
  trashed(folder, id) {
    const item = typeof id === 'string' ? sql.get('SELECT * FROM folder_items WHERE id = ? AND folder_id = ? AND trash_root = id', id, folder.id) : null;
    if (!item) throw HttpError.notFound('That file');
    return item;
  },

  // anything in the folder, live or in the trash
  any(folder, id) {
    const item = typeof id === 'string' ? sql.get('SELECT * FROM folder_items WHERE id = ? AND folder_id = ?', id, folder.id) : null;
    if (!item) throw HttpError.notFound('That file');
    return item;
  },

  // the ids of an item and everything ever inside it, trash included
  allUnder(itemId) {
    return sql.all(`${UNDER} SELECT id FROM under`, itemId).map((r) => r.id);
  },

  // Straight into the folder (null) or into one of its subfolders, never into itself or anything
  // inside it, nor into the trash.
  parent(folder, value, moving = null) {
    if (value === null || value === undefined) return null;
    const parent = sql.get("SELECT id, parent_id FROM folder_items WHERE id = ? AND folder_id = ? AND kind = 'folder' AND deleted_at IS NULL", typeof value === 'string' ? value : '', folder.id);
    if (!parent) throw HttpError.badRequest('That folder isn’t in this shared folder.');
    for (let at = parent; at; at = at.parent_id ? sql.get('SELECT id, parent_id FROM folder_items WHERE id = ?', at.parent_id) : null) {
      if (at.id === moving) throw HttpError.badRequest('A folder can’t go inside itself.');
    }
    return parent.id;
  },

  // Moving or renaming: whoever added it, or someone who manages the folder.
  mayChange(folder, user, item) {
    if (item.created_by !== user.id && !folderManager(folder, user)) throw HttpError.forbidden('Only whoever added this, or the folder’s creator or an admin, can change it.');
  },

  // Deleting takes everything inside along, so it needs all of it to be this person's, or a manager.
  mayRemove(folder, user, item) {
    if (folderManager(folder, user)) return;
    if (itemPlace.under(item).some((i) => i.created_by !== user.id)) throw HttpError.forbidden('Some of this was added by someone else. Only the folder’s creator or an admin can delete it all.');
  },

  // The item and everything inside it in the same state: what's live under a live item, or what
  // went to the trash with a deleted one.
  under(item) {
    if (item.deleted_at) return sql.all('SELECT * FROM folder_items WHERE trash_root = ?', item.id);
    return sql.all(`${UNDER} SELECT * FROM folder_items WHERE id IN (SELECT id FROM under) AND deleted_at IS NULL`, item.id);
  },

  // the blobs of an item and everything inside it, trash included
  blobsUnder(itemId) {
    return sql
      .all(`${UNDER} SELECT blob_id, thumb_id, hashes_id FROM folder_items WHERE id IN (SELECT id FROM under)`, itemId)
      .flatMap((r) => [r.blob_id, r.thumb_id, r.hashes_id])
      .filter(Boolean);
  },
};

export default itemPlace;
