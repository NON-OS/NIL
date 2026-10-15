import sql from '../db/sql.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';

const randomColor = () => domain.colors[Math.floor(Math.random() * domain.colors.length)];

// "NØNOS" becomes NON: letters like Ø fold to their closest plain letter before trimming.
function workspacePrefix(name) {
  const plain = name.toUpperCase().replace(/Ø/g, 'O').normalize('NFD').replace(/[^A-Z0-9]/g, '');
  return (plain || 'NON').slice(0, 3);
}

// Creates a person with their wallet: the first owner during setup, someone holding an
// invite, or a NOX holder joining through the open door.
export default function createAccount({ mode, id = newId(), name, workspaceName, inviteHash, address }) {
  sql.tx(() => {
    let role = 'member';
    let guestProjects = [];
    if (mode === 'setup') {
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This workspace is already set up. Sign in instead.');
      sql.run('INSERT INTO workspace (id, name, task_prefix, created_at) VALUES (1, ?, ?, ?)', workspaceName, workspacePrefix(workspaceName), Date.now());
      role = 'owner';
    } else if (mode === 'invite') {
      const invite = sql.get('SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', inviteHash, Date.now());
      if (!invite) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
      role = ['admin', 'guest'].includes(invite.role) ? invite.role : 'member';
      guestProjects = role === 'guest' ? parseJSON(invite.project_ids, []) : [];
    } else if (mode === 'bounty') {
      // an accepted outside applicant: a guest who sees only the tasks given to them
      role = 'guest';
    }
    if (sql.get('SELECT 1 FROM credentials WHERE external_id = ?', address)) throw HttpError.badRequest('That wallet already has an account here. Sign in with it instead.');
    sql.run('INSERT INTO users (id, name, role, color, joined_via, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, role, randomColor(), mode, Date.now());
    if (mode === 'invite') sql.run('UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ?', id, Date.now(), inviteHash);
    for (const projectId of guestProjects) sql.run('INSERT OR IGNORE INTO project_guests (project_id, user_id) SELECT id, ? FROM projects WHERE id = ?', id, projectId);
    sql.run(
      "INSERT INTO credentials (id, user_id, kind, external_id, label, created_at) VALUES (?, ?, 'wallet', ?, 'Ethereum wallet', ?)",
      newId(), id, address, Date.now(),
    );
  });
  return id;
}
