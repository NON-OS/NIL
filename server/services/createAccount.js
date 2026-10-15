import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';

const randomColor = () => domain.colors[Math.floor(Math.random() * domain.colors.length)];

function workspacePrefix(name) {
  return (name.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'NON').slice(0, 3);
}

// One place that creates people, whichever way they sign up: the first owner during setup,
// or anyone holding an invite. Passwords, passkeys and wallets all end up here.
export default function createAccount({ mode, id = newId(), name, workspaceName, inviteHash, email = null, passwordHash = null, credential = null }) {
  sql.tx(() => {
    let role = 'owner';
    if (mode === 'setup') {
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This workspace is already set up. Sign in instead.');
      sql.run('INSERT INTO workspace (id, name, task_prefix, created_at) VALUES (1, ?, ?, ?)', workspaceName, workspacePrefix(workspaceName), Date.now());
    } else {
      const invite = sql.get('SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', inviteHash, Date.now());
      if (!invite) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
      if (invite.email && email && invite.email !== email) throw HttpError.badRequest('This invite was sent to a different email address.');
      email ??= invite.email;
      role = invite.role === 'admin' ? 'admin' : 'member';
    }
    if (email && sql.get('SELECT 1 FROM users WHERE email = ?', email)) throw HttpError.badRequest('That email already has an account here. Sign in instead.');
    sql.run(
      'INSERT INTO users (id, email, name, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, email, name, passwordHash, role, randomColor(), Date.now(),
    );
    if (mode === 'invite') sql.run('UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ?', id, Date.now(), inviteHash);
    if (credential) {
      sql.run(
        'INSERT INTO credentials (id, user_id, kind, external_id, public_key, counter, transports, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newId(), id, credential.kind, credential.externalId, credential.publicKey ?? null, credential.counter ?? 0, JSON.stringify(credential.transports ?? []), credential.label ?? '', Date.now(),
      );
    }
  });
  return id;
}
