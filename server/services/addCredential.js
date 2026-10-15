import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';

export default function addCredential(userId, credential) {
  if (sql.get('SELECT 1 FROM credentials WHERE external_id = ?', credential.externalId)) {
    throw HttpError.badRequest(credential.kind === 'wallet' ? 'That wallet is already linked to an account here.' : 'That passkey is already registered.');
  }
  const id = newId();
  sql.run(
    'INSERT INTO credentials (id, user_id, kind, external_id, public_key, counter, transports, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, userId, credential.kind, credential.externalId, credential.publicKey ?? null, credential.counter ?? 0, JSON.stringify(credential.transports ?? []), credential.label ?? '', Date.now(),
  );
  return id;
}
