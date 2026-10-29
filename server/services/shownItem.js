import sql from '../db/sql.js';
import toFolderItem from '../mappers/toFolderItem.js';

// One file or subfolder as its folder's readers get it, with the blobs it's made of.
export default function shownItem(id) {
  const row = sql.get('SELECT * FROM folder_items WHERE id = ?', id);
  const blobs = new Map([row.blob_id, row.thumb_id, row.hashes_id].filter(Boolean).map((b) => [b, sql.get('SELECT * FROM sealed_blobs WHERE id = ?', b)]));
  return toFolderItem(row, blobs);
}
