import fs from 'node:fs';
import sql from '../db/sql.js';
import chatFilePath from './chatFilePath.js';

// Removes chat files' rows and their encrypted bytes on disk.
export default function dropChatFiles(where, ...params) {
  const ids = sql.all(`SELECT id FROM chat_files WHERE ${where}`, ...params).map((r) => r.id);
  for (const id of ids) {
    sql.run('DELETE FROM chat_files WHERE id = ?', id);
    fs.rm(chatFilePath(id), { force: true }, () => {});
  }
  return ids.length;
}
