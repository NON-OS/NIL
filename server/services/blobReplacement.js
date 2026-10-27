import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import dropBlobs from './dropBlobs.js';
import resealWaiting from './resealWaiting.js';

// A fresh copy of a blob that's waiting to be encrypted again: the same doc or folder, the same
// size, since the same bytes encrypt to the same length. It takes the old one's place one for
// one, so no quota is charged for it while both exist. A copy this person started before for the
// same blob and never swapped in is thrown away; they're starting over.
export default async function blobReplacement(value, scope, size, user) {
  const old = typeof value === 'string' ? sql.get('SELECT * FROM sealed_blobs WHERE id = ? AND finished_at IS NOT NULL', value) : null;
  if (!old || old.scope_kind !== scope.kind || old.scope_id !== scope.id || !resealWaiting(old)) throw HttpError.badRequest('That file isn’t waiting to be encrypted again.');
  if (old.size !== size) throw HttpError.badRequest('A fresh copy of a file has the same size as the file.');
  await dropBlobs(sql.all('SELECT id FROM sealed_blobs WHERE replaces = ? AND uploader_id = ?', old.id, user.id).map((r) => r.id));
  return old.id;
}
