import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import uploadDir from '../lib/uploadDir.js';
import stagedFile from '../lib/stagedFile.js';
import scrubAgentTraces from './scrubAgentTraces.js';

// Permanently removes tasks with their comments, files and history. Receipts keep their
// signed bodies (so exported proofs stay valid) but lose the private data needed to reveal titles.
export default function eraseTasks(ids) {
  if (!ids.length) return 0;
  const files = [];
  sql.tx(() => {
    for (const id of ids) {
      files.push(...sql.all('SELECT id FROM attachments WHERE task_id = ?', id).map((r) => r.id));
      sql.run('UPDATE receipts SET title = NULL, salt = NULL WHERE task_id = ?', id);
      scrubAgentTraces(id, 'The task was erased.');
      sql.run('DELETE FROM tasks WHERE id = ?', id);
    }
  });
  for (const id of files) {
    fs.rm(path.join(uploadDir, id), { force: true }, () => {});
    stagedFile.discard(id);
  }
  checkpoint();
  return ids.length;
}
