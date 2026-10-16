import crypto from 'node:crypto';
import sql from '../db/sql.js';

// Anonymous ballots are counted an hour at a time. A ballot that showed up in the count, or in
// the database, the moment it arrived could be matched against the signed-in request just
// before it from the same browser. Held back until its hour ends, it joins the count with every
// other ballot from that hour, in random order, and carries only the hour as its time.
const HOUR = 3_600_000;
const hourOf = (time) => time - (time % HOUR);

const COUNT = {
  plain: {
    sql: `INSERT INTO anonymous_ballots (proposal_id, nullifier, choice, proof, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (proposal_id, nullifier) DO UPDATE SET choice = excluded.choice, proof = excluded.proof, created_at = excluded.created_at`,
    values: (b) => [b.choice, JSON.stringify(b.proof)],
  },
  encrypted: {
    sql: `INSERT INTO encrypted_ballots (proposal_id, nullifier, ciphertexts, proof, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (proposal_id, nullifier) DO UPDATE SET ciphertexts = excluded.ciphertexts, proof = excluded.proof, created_at = excluded.created_at`,
    values: (b) => [JSON.stringify(b.ciphertexts), JSON.stringify(b.proof)],
  },
};

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const heldBallots = {
  hourOf,

  // A second ballot from the same voter (same nullifier) replaces the first, held or not.
  // Returns when it joins the count.
  hold(proposalId, nullifier, ballot) {
    const hour = hourOf(Date.now());
    sql.run(
      'INSERT INTO held_ballots (proposal_id, nullifier, ballot, hour) VALUES (?, ?, ?, ?) ON CONFLICT (proposal_id, nullifier) DO UPDATE SET ballot = excluded.ballot, hour = excluded.hour',
      proposalId, nullifier, JSON.stringify(ballot), hour,
    );
    return hour + HOUR;
  },

  // Counts every ballot whose hour has ended, or all of one vote's when it closes. Returns how
  // many joined the count, so callers know whether anything visible changed.
  release({ proposalId = null, all = false } = {}) {
    const rows = all
      ? sql.all('SELECT h.*, p.weighting FROM held_ballots h JOIN proposals p ON p.id = h.proposal_id WHERE h.proposal_id = ?', proposalId)
      : sql.all('SELECT h.*, p.weighting FROM held_ballots h JOIN proposals p ON p.id = h.proposal_id WHERE h.hour < ? AND (? IS NULL OR h.proposal_id = ?)', hourOf(Date.now()), proposalId, proposalId);
    if (!rows.length) return 0;
    sql.tx(() => {
      for (const row of shuffle(rows)) {
        const kind = COUNT[row.weighting === 'power' ? 'encrypted' : 'plain'];
        sql.run(kind.sql, row.proposal_id, row.nullifier, ...kind.values(JSON.parse(row.ballot)), row.hour);
        sql.run('DELETE FROM held_ballots WHERE proposal_id = ? AND nullifier = ?', row.proposal_id, row.nullifier);
      }
    });
    return rows.length;
  },
};

export default heldBallots;
