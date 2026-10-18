import crypto from 'node:crypto';
import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import ballotHour from './ballotHour.js';

// Anonymous ballots are counted an hour at a time. A ballot that showed up in the count, or in
// the database, the moment it arrived could be matched against the signed-in request just
// before it from the same browser. Held back until its hour ends, it joins the count with every
// other ballot from that hour, in random order, and carries only the hour as its time.
const COUNT = {
  plain: {
    sql: `INSERT INTO anonymous_ballots (proposal_id, nullifier, choice, proof, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (proposal_id, nullifier) DO UPDATE SET choice = excluded.choice, proof = excluded.proof, created_at = excluded.created_at
          WHERE excluded.created_at >= anonymous_ballots.created_at`,
    values: (b) => [b.choice, JSON.stringify(b.proof)],
  },
  encrypted: {
    sql: 'INSERT INTO encrypted_ballots (proposal_id, nullifier, ciphertexts, proof, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (proposal_id, nullifier) DO NOTHING',
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
  hourOf: ballotHour.of,

  // A Semaphore ballot names the hour it was proven in (`hour`, the hour's first millisecond), and
  // a later ballot from the same voter (same nullifier) replaces an earlier one, held or counted.
  // A copy of an old proof must not undo a change of mind: one from an earlier hour than the
  // ballot it would replace is refused, and so, within one hour, is a choice this voter already
  // changed away from, which can't be told apart from a copy. An encrypted ballot carries no
  // hour, so it's `final`: the first one a voter casts counts. Returns when it joins the count.
  hold(proposalId, nullifier, ballot, { hour = ballotHour.of(Date.now()), final = false } = {}) {
    const held = sql.get('SELECT ballot, hour, replaced FROM held_ballots WHERE proposal_id = ? AND nullifier = ?', proposalId, nullifier);
    if (final && (held || sql.get('SELECT 1 FROM encrypted_ballots WHERE proposal_id = ? AND nullifier = ?', proposalId, nullifier))) {
      throw new HttpError(409, 'You’ve already voted in this vote. Encrypted ballots are final, so it can’t be changed.');
    }
    if (!held) {
      sql.run('INSERT INTO held_ballots (proposal_id, nullifier, ballot, hour) VALUES (?, ?, ?, ?)', proposalId, nullifier, JSON.stringify(ballot), hour);
      return ballotHour.countsAt(hour);
    }
    if (hour < held.hour) throw new HttpError(409, 'A newer ballot of yours is already in, so this one doesn’t count.');
    const current = JSON.parse(held.ballot).choice;
    const replaced = hour === held.hour && held.replaced ? held.replaced.split(',').map(Number) : [];
    if (hour === held.hour && ballot.choice === current) return ballotHour.countsAt(hour);
    if (replaced.includes(ballot.choice)) throw new HttpError(409, 'You already changed your vote away from that option this hour. To pick it again, vote once the next hour has started.');
    const next = hour === held.hour ? [...replaced, current].join(',') : '';
    sql.run('UPDATE held_ballots SET ballot = ?, hour = ?, replaced = ? WHERE proposal_id = ? AND nullifier = ?', JSON.stringify(ballot), hour, next, proposalId, nullifier);
    return ballotHour.countsAt(hour);
  },

  // Counts every ballot whose hour, and the grace after it, has ended, or all of one vote's when
  // it closes. Returns how many joined the count, so callers know whether anything visible changed.
  release({ proposalId = null, all = false } = {}) {
    const rows = all
      ? sql.all('SELECT h.*, p.weighting FROM held_ballots h JOIN proposals p ON p.id = h.proposal_id WHERE h.proposal_id = ?', proposalId)
      : sql.all('SELECT h.*, p.weighting FROM held_ballots h JOIN proposals p ON p.id = h.proposal_id WHERE h.hour < ? AND (? IS NULL OR h.proposal_id = ?)', ballotHour.countableBefore(), proposalId, proposalId);
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
