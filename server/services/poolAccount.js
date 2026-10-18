import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';

const ID = 'team';
const B64U = /^[A-Za-z0-9_-]+$/;
const TAG = /^[0-9a-f]{32}$/;
const MAX_NOTES = 512 * 1024;
const MAX_WRAP = 256;

const sealed = (value, max, what) => {
  const text = String(value ?? '');
  if (!text || text.length > max || !B64U.test(text)) throw HttpError.badRequest(`That ${what} is malformed.`);
  return text;
};
const admins = () => new Set(sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin') AND deactivated = 0 AND kind = 'human'").map((r) => r.id));
const account = () => sql.get('SELECT * FROM pool_account WHERE id = ?', ID);

function mustHold(userId) {
  const grant = sql.get('SELECT wrapped FROM pool_account_keys WHERE user_id = ?', userId);
  if (!account() || !grant) throw new HttpError(409, 'You don’t hold the team’s pool key yet. Ask an admin who does to open the pool on the Bounties page, which shares it with you.');
  return grant;
}

// The team's Privacy Pools account as the server keeps it: a public tag that names the key, the
// key sealed in admins' browsers to each admin who holds it, and the team's notes encrypted
// under the key. None of it opens without an admin's own keys. Only current admins count as
// holders; a key sealed to someone who has since stopped being one is never handed out.
const poolAccount = {
  view(userId) {
    const row = account();
    if (!row) return { exists: false };
    const current = admins();
    const grants = sql.all('SELECT user_id, wrapped FROM pool_account_keys').filter((g) => current.has(g.user_id));
    return {
      exists: true,
      keyTag: row.key_tag,
      // where a rebuild from the chain starts: nothing of the team's is older
      startBlock: row.start_block,
      notes: row.notes,
      notesRev: row.notes_rev,
      notesBy: row.notes_by,
      updatedAt: row.updated_at,
      wrapped: grants.find((g) => g.user_id === userId)?.wrapped ?? null,
      holders: grants.map((g) => g.user_id),
    };
  },

  create(userId, { keyTag, wrapped, notes }, startBlock) {
    const tag = String(keyTag ?? '');
    if (!TAG.test(tag)) throw HttpError.badRequest('That pool key tag is malformed.');
    const wrap = sealed(wrapped, MAX_WRAP, 'sealed key');
    const book = sealed(notes, MAX_NOTES, 'notes');
    const now = Date.now();
    sql.tx(() => {
      if (account()) throw new HttpError(409, 'The team already has a pool account. Reload to open it.');
      sql.run('INSERT INTO pool_account (id, key_tag, start_block, notes, notes_rev, notes_by, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)', ID, tag, startBlock, book, userId, userId, now, now);
      sql.run('INSERT INTO pool_account_keys (user_id, wrapped, granted_by, created_at) VALUES (?, ?, ?, ?)', userId, wrap, userId, now);
    });
    return poolAccount.view(userId);
  },

  // Seals the key to more admins. The browser seals only to keys its person confirmed.
  grant(userId, grants) {
    mustHold(userId);
    if (!Array.isArray(grants) || !grants.length || grants.length > 50) throw HttpError.badRequest('Name the admins to share the pool key with.');
    const current = admins();
    const now = Date.now();
    sql.tx(() => {
      for (const g of grants) {
        const to = String(g?.userId ?? '');
        if (to === userId || !current.has(to)) throw HttpError.badRequest('The pool key can only be shared with other admins.');
        sql.run(
          'INSERT INTO pool_account_keys (user_id, wrapped, granted_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET wrapped = excluded.wrapped, granted_by = excluded.granted_by, created_at = excluded.created_at',
          to, sealed(g.wrapped, MAX_WRAP, 'sealed key'), userId, now,
        );
      }
    });
    return poolAccount.view(userId);
  },

  // Saves new notes only over the revision the browser started from, so two admins paying at
  // once can't wipe out each other's notes; the second gets a 409 and merges.
  saveNotes(userId, { notes, rev }) {
    mustHold(userId);
    const book = sealed(notes, MAX_NOTES, 'notes');
    const { changes } = sql.run('UPDATE pool_account SET notes = ?, notes_rev = notes_rev + 1, notes_by = ?, updated_at = ? WHERE id = ? AND notes_rev = ?', book, userId, Date.now(), ID, Number(rev));
    if (!changes) throw new HttpError(409, 'Another admin changed the pool notes. Nil reloads them and tries again.');
    return poolAccount.view(userId);
  },
};

export default poolAccount;
