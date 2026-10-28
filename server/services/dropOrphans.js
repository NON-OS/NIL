import sql from '../db/sql.js';
import dropBlobs from './dropBlobs.js';

const scoped = (kind, id) => sql.all('SELECT id FROM sealed_blobs WHERE scope_kind = ? AND scope_id = ?', kind, id).map((r) => r.id);

// Docs and folders that nobody holds a key to any more: their last reader was erased or reset
// their keys. Nobody can ever open them again, and no admin can delete what they can't open, so
// they go here, with their pictures and files, instead of filling the disk for good.
export default async function dropOrphans() {
  const docs = sql.all('SELECT id FROM docs d WHERE NOT EXISTS (SELECT 1 FROM doc_keys k WHERE k.doc_id = d.id)').map((r) => r.id);
  const folders = sql.all('SELECT id FROM folders f WHERE NOT EXISTS (SELECT 1 FROM folder_keys k WHERE k.folder_id = f.id)').map((r) => r.id);
  if (!docs.length && !folders.length) return 0;
  const blobs = [];
  sql.tx(() => {
    for (const id of docs) {
      blobs.push(...scoped('doc', id));
      sql.run('DELETE FROM docs WHERE id = ?', id);
    }
    for (const id of folders) {
      blobs.push(...scoped('folder', id));
      sql.run('DELETE FROM folders WHERE id = ?', id);
    }
  });
  await dropBlobs(blobs);
  return docs.length + folders.length;
}
