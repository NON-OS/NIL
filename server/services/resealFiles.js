import fs from 'node:fs';
import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';
import opaqueFile from '../lib/opaqueFile.js';
import plainFile from '../lib/plainFile.js';
import stagedFile from '../lib/stagedFile.js';
import parseFileSeal from './parseFileSeal.js';

function stagedSize(id, sealed) {
  const file = stagedFile.path(id, sealed);
  if (!fs.existsSync(file)) throw new HttpError(409, 'A file on this task didn’t finish uploading. Try again.');
  return fs.statSync(file).size;
}

// When a private task is sealed, opened up again or gets a fresh key, its files move with it,
// all or nothing like its comments. A fresh key only re-wraps each file's own key, so the
// stored files stay exactly as they are. Sealing or opening up swaps in the copy the browser
// staged for each file, encrypted or plain. `sealId` is the task's new seal, or null when it's
// opened up. Returns the staged copies to move into place once the transaction has committed.
export default function resealFiles(taskId, files, { sealId }) {
  const stored = sql.all('SELECT id, sealed FROM attachments WHERE task_id = ?', taskId);
  if (!stored.length) return [];
  const list = Array.isArray(files) ? files : [];
  const byId = new Map(list.map((f) => [String(f?.id ?? ''), f]));
  if (byId.size !== stored.length || stored.some((r) => !byId.has(r.id))) {
    throw new HttpError(409, 'The files on this task changed while it was being re-encrypted. Try again.');
  }

  const swaps = [];
  for (const row of stored) {
    const entry = byId.get(row.id);
    const current = parseJSON(row.sealed, null);
    if (sealId && current) {
      // only the wrapped key is taken; the file's seal id, origin and sealed name stay as they were
      sql.run('UPDATE attachments SET sealed = ? WHERE id = ?', JSON.stringify(parseFileSeal({ ...current, key: entry.key })), row.id);
    } else if (sealId) {
      const sealed = parseFileSeal(entry.sealed);
      if (sealed.seal !== sealId) throw HttpError.badRequest('Each file has to be encrypted under the task’s new key.');
      sql.run('UPDATE attachments SET filename = ?, mime = ?, size = ?, sealed = ? WHERE id = ?', opaqueFile.filename, opaqueFile.mime, stagedSize(row.id, true), JSON.stringify(sealed), row.id);
      swaps.push({ id: row.id, sealed: true });
    } else if (current) {
      const { filename, mime } = plainFile(entry.filename, entry.mime);
      sql.run('UPDATE attachments SET filename = ?, mime = ?, size = ?, sealed = NULL WHERE id = ?', filename, mime, stagedSize(row.id, false), row.id);
      swaps.push({ id: row.id, sealed: false });
    }
  }
  return swaps;
}
