import sql from '../db/sql.js';

export default function publicWorkspace() {
  const row = sql.get('SELECT name, task_prefix, crypto_tools FROM workspace WHERE id = 1');
  return row ? { name: row.name, taskPrefix: row.task_prefix, cryptoTools: row.crypto_tools === 1 } : null;
}
