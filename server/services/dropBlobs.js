import fs from 'node:fs';
import sql from '../db/sql.js';
import blobChunk from '../lib/blobChunk.js';

// Deletes sealed blobs: their rows at once, then every chunk file they could have, written or
// not. A file in a folder points at its blob, so the file goes first. Resolves once the chunk
// files are gone.
export default function dropBlobs(ids) {
  const rows = [...new Set(ids)].map((id) => sql.get('SELECT id, chunks FROM sealed_blobs WHERE id = ?', id)).filter(Boolean);
  if (!rows.length) return Promise.resolve(0);
  sql.tx(() => {
    for (const row of rows) sql.run('DELETE FROM sealed_blobs WHERE id = ?', row.id);
  });
  const files = rows.flatMap((row) => Array.from({ length: row.chunks }, (_, i) => blobChunk(row.id, i)));
  return Promise.all(files.map((file) => fs.promises.rm(file, { force: true }))).then(
    () => rows.length,
    () => rows.length,
  );
}
