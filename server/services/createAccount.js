import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';

const randomColor = () => domain.colors[Math.floor(Math.random() * domain.colors.length)];

function workspacePrefix(name) {
  return (name.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'NON').slice(0, 3);
}

// Creates a person with their wallet: the first owner during setup, someone holding an
// invite, or a NOX holder joining through the open door.
export default function createAccount({ mode, id = newId(), name, workspaceName, inviteHash, address }) {
  sql.tx(() => {
    let role = 'member';
    if (mode === 'setup') {
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This workspace is already set up. Sign in instead.');
      sql.run('INSERT INTO workspace (id, name, task_prefix, created_at) VALUES (1, ?, ?, ?)', workspaceName, workspacePrefix(workspaceName), Date.now());
      role = 'owner';
    } else if (mode === 'invite') {
      const invite = sql.get('SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', inviteHash, Date.now());
      if (!invite) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
      role = invite.role === 'admin' ? 'admin' : 'member';
    }
    if (sql.get('SELECT 1 FROM credentials WHERE external_id = ?', address)) throw HttpError.badRequest('That wallet already has an account here. Sign in with it instead.');
    sql.run('INSERT INTO users (id, name, role, color, joined_via, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, role, randomColor(), mode, Date.now());
    if (mode === 'invite') sql.run('UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ?', id, Date.now(), inviteHash);
    sql.run(
      "INSERT INTO credentials (id, user_id, kind, external_id, label, created_at) VALUES (?, ?, 'wallet', ?, 'Ethereum wallet', ?)",
      newId(), id, address, Date.now(),
    );
  });
  return id;
}
