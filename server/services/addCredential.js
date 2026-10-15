import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';

export default function addCredential(userId, address) {
  if (sql.get('SELECT 1 FROM credentials WHERE external_id = ?', address)) throw HttpError.badRequest('That wallet is already linked to an account here.');
  const id = newId();
  sql.run("INSERT INTO credentials (id, user_id, kind, external_id, label, created_at) VALUES (?, ?, 'wallet', ?, 'Ethereum wallet', ?)", id, userId, address, Date.now());
  return id;
}
