import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';

const { chunkBytes, tagBytes } = config.sealedBlobs;
// each chunk's SHA-256 in a file's chunk list
const HASH_BYTES = 32;
const UPLOAD_FIRST = 'Upload the file before adding it.';

const sealedSize = (plain) => plain + tagBytes * Math.max(1, Math.ceil(plain / chunkBytes));
const unused = (id) => !sql.get('SELECT 1 FROM folder_items WHERE blob_id = ? OR thumb_id = ? OR hashes_id = ?', id, id, id);

// The blobs a file in a shared folder is made of: its contents, a thumbnail and, for a file of
// more than one chunk, the list of its chunks' hashes. Each was uploaded by whoever adds the file,
// to this folder, finished, and isn't any other file's. A thumbnail is small, and a chunk list is
// exactly as long as its file has chunks, so neither can be a large file under another name.
const itemBlobs = {
  own(folder, user, id) {
    const blob = sql.get("SELECT * FROM sealed_blobs WHERE id = ? AND scope_kind = 'folder' AND scope_id = ? AND uploader_id = ? AND finished_at IS NOT NULL AND replaces IS NULL", typeof id === 'string' ? id : '', folder.id, user.id);
    if (!blob || !unused(blob.id)) throw HttpError.badRequest(UPLOAD_FIRST);
    return blob;
  },

  thumb(folder, user, id) {
    const blob = itemBlobs.own(folder, user, id);
    if (blob.size > config.files.thumbMaxBytes) throw HttpError.badRequest('That thumbnail is too large.');
    return blob;
  },

  hashes(folder, user, id, file) {
    const blob = itemBlobs.own(folder, user, id);
    if (file.chunks < 2 || blob.size !== sealedSize(HASH_BYTES * file.chunks)) throw HttpError.badRequest('That list of hashes doesn’t fit the file.');
    return blob;
  },

  // A fresh copy of one of a file's blobs, made by this person while encrypting the file again.
  copy(folder, user, id, replaces) {
    const blob = sql.get("SELECT * FROM sealed_blobs WHERE id = ? AND scope_kind = 'folder' AND scope_id = ? AND uploader_id = ? AND finished_at IS NOT NULL AND replaces = ?", typeof id === 'string' ? id : '', folder.id, user.id, replaces ?? '');
    if (!blob) throw HttpError.badRequest('Encrypt the file again before swapping it in.');
    return blob;
  },
};

export default itemBlobs;
