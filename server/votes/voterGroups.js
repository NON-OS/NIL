import sql from '../db/sql.js';
import groupRoot from './groupRoot.js';

const OPEN = 'SELECT id FROM proposals WHERE anonymous = 1 AND closed_at IS NULL AND closes_at > ?';

function members(proposalId) {
  return sql.all('SELECT commitment, removed FROM proposal_voters WHERE proposal_id = ? ORDER BY position', proposalId).map((r) => ({ commitment: r.commitment, removed: Boolean(r.removed) }));
}

function saveRoot(proposalId, { revokeOlder = false } = {}) {
  const root = groupRoot(members(proposalId));
  if (!root) return;
  // removing someone must also retire every older root, or a proof against one would still count
  if (revokeOlder) sql.run('UPDATE proposal_roots SET revoked = 1 WHERE proposal_id = ?', proposalId);
  sql.run('INSERT INTO proposal_roots (proposal_id, root, created_at) VALUES (?, ?, ?) ON CONFLICT (proposal_id, root) DO UPDATE SET revoked = 0', proposalId, root, Date.now());
}

function append(proposalId, commitment) {
  if (sql.get('SELECT 1 FROM proposal_voters WHERE proposal_id = ? AND commitment = ?', proposalId, commitment)) return false;
  const next = sql.get('SELECT COALESCE(MAX(position) + 1, 0) AS n FROM proposal_voters WHERE proposal_id = ?', proposalId).n;
  sql.run('INSERT INTO proposal_voters (proposal_id, position, commitment) VALUES (?, ?, ?)', proposalId, next, commitment);
  return true;
}

// Who may cast an anonymous ballot, as Semaphore groups: every active member with a voting
// key, frozen into a Merkle tree per vote. People who set up a key later are appended.
const voterGroups = {
  members,

  acceptedRoots: (proposalId) => new Set(sql.all('SELECT root FROM proposal_roots WHERE proposal_id = ? AND revoked = 0', proposalId).map((r) => r.root)),

  start(proposalId) {
    sql.tx(() => {
      for (const u of sql.all("SELECT semaphore_commitment AS c FROM users WHERE deactivated = 0 AND role != 'guest' AND semaphore_commitment IS NOT NULL ORDER BY created_at")) append(proposalId, u.c);
      saveRoot(proposalId);
    });
  },

  // a member set up (or reactivated) their voting key: add them to every vote still open
  join(userId) {
    const user = sql.get("SELECT semaphore_commitment AS c FROM users WHERE id = ? AND deactivated = 0 AND role != 'guest'", userId);
    if (!user?.c) return;
    sql.tx(() => {
      for (const { id } of sql.all(OPEN, Date.now())) {
        const removed = sql.get('SELECT position FROM proposal_voters WHERE proposal_id = ? AND commitment = ? AND removed = 1', id, user.c);
        if (removed) sql.run('UPDATE proposal_voters SET removed = 0 WHERE proposal_id = ? AND position = ?', id, removed.position);
        if (removed || append(id, user.c)) saveRoot(id);
      }
    });
  },

  // a member lost access or became a guest: empty their leaf in every open vote
  leave(userId) {
    const user = sql.get('SELECT semaphore_commitment AS c FROM users WHERE id = ?', userId);
    if (!user?.c) return;
    sql.tx(() => {
      for (const { id } of sql.all(OPEN, Date.now())) {
        const { changes } = sql.run('UPDATE proposal_voters SET removed = 1 WHERE proposal_id = ? AND commitment = ? AND removed = 0', id, user.c);
        if (changes) saveRoot(id, { revokeOlder: true });
      }
    });
  },

  inOpenVote: (commitment) => Boolean(sql.get(`SELECT 1 FROM proposal_voters v JOIN proposals p ON p.id = v.proposal_id WHERE v.commitment = ? AND p.anonymous = 1 AND p.closed_at IS NULL AND p.closes_at > ?`, commitment, Date.now())),
};

export default voterGroups;
