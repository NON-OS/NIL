import { Group } from '@semaphore-protocol/group';
import sql from '../db/sql.js';
import config from '../config.js';
import units from '../config/units.js';

const MEMBERS = "SELECT semaphore_commitment AS c FROM users WHERE deactivated = 0 AND role != 'guest' AND kind = 'human' AND semaphore_commitment IS NOT NULL AND (semaphore_pending IS NULL OR semaphore_pending = semaphore_commitment) ORDER BY semaphore_commitment";
let cached = { key: '', root: null };

function rootOf(members) {
  const key = members.join(',');
  if (cached.key !== key || !members.length) {
    const group = new Group();
    for (const c of members) group.addMember(BigInt(c));
    cached = { key, root: members.length ? group.root.toString() : null };
  }
  return cached.root;
}

// The current root becomes the newest kept one; older ones go once they fall out of the window
// or past the few kept. Times are kept to the minute, which is all the window needs.
function record(root, members) {
  const latest = sql.get('SELECT root FROM ai_credit_roots WHERE replaced_at IS NULL');
  if (latest?.root === root) return;
  const now = Date.now();
  sql.tx(() => {
    sql.run('UPDATE ai_credit_roots SET replaced_at = ? WHERE replaced_at IS NULL', now - (now % units.MINUTE));
    if (root) sql.run('INSERT INTO ai_credit_roots (root, members, replaced_at) VALUES (?, ?, NULL) ON CONFLICT (root) DO UPDATE SET members = excluded.members, replaced_at = NULL', root, JSON.stringify(members));
    sql.run('DELETE FROM ai_credit_roots WHERE replaced_at < ?', now - config.aiCredits.rootWindowMs);
    sql.run('DELETE FROM ai_credit_roots WHERE replaced_at IS NOT NULL AND root NOT IN (SELECT root FROM ai_credit_roots WHERE replaced_at IS NOT NULL ORDER BY replaced_at DESC LIMIT ?)', config.aiCredits.roots);
  });
}

// Who may spend an AI credit: the people anonymous votes count, every active member (no guests,
// no agents) with a voting key, except anyone waiting to switch to a new one: they send signed in
// meanwhile, so their old key mustn't also spend. Read fresh each time, so someone who leaves is
// out at once.
// Members go in key order, which says nothing about who joined when.
const creditGroup = {
  current() {
    const members = sql.all(MEMBERS).map((r) => r.c);
    const root = rootOf(members);
    record(root, members);
    return { members, root };
  },

  // The current root, or one of the last few it replaced within the window, as long as that one
  // holds nobody who has left since. A proof against a root with a departed member never counts.
  accepts(root) {
    const { members, root: current } = creditGroup.current();
    if (!current) return false;
    if (root === current) return true;
    const row = sql.get('SELECT members, replaced_at FROM ai_credit_roots WHERE root = ? AND replaced_at >= ?', root, Date.now() - config.aiCredits.rootWindowMs);
    if (!row) return false;
    const now = new Set(members);
    return JSON.parse(row.members).every((c) => now.has(c));
  },
};

export default creditGroup;
