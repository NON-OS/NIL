import sql from '../../db/sql.js';
import config from '../../config.js';
import parseJSON from '../../lib/parseJSON.js';
import aggregateBallots from './aggregateBallots.js';
import trusteeKey from './trusteeKey.js';
import combineTotals from './combineTotals.js';
import curvePoint from './curvePoint.js';

const dealingsOf = (proposalId) =>
  sql.all('SELECT position, dealing FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', proposalId).map((t) => {
    const d = parseJSON(t.dealing, null);
    return d ? d.commitments.map(curvePoint) : null;
  });

// Everything about an encrypted vote's count: the summed ciphertexts, each trustee's public
// share, and once two trustees have handed in valid partials, the decrypted totals.
const encryptedTally = {
  dealingsOf,

  aggregates(proposal) {
    const ballots = sql.all('SELECT ciphertexts FROM encrypted_ballots WHERE proposal_id = ?', proposal.id).map((b) => JSON.parse(b.ciphertexts));
    return aggregateBallots(ballots, parseJSON(proposal.options, []).length);
  },

  publicShare: (proposalId, position) => trusteeKey(dealingsOf(proposalId), position),

  // Decrypts once two partials are in. Totals are whole NOX of power; the stored result uses
  // the token's smallest unit like every other weighted tally.
  finish(proposal) {
    const partials = sql
      .all('SELECT position, partial FROM proposal_trustees WHERE proposal_id = ? AND partial IS NOT NULL ORDER BY partial_at LIMIT 2', proposal.id)
      .map((p) => ({ position: p.position, d: JSON.parse(p.partial).d.map(curvePoint) }));
    if (partials.length < 2) return null;
    const bound = sql.all('SELECT power FROM proposal_voters WHERE proposal_id = ? AND power IS NOT NULL', proposal.id).reduce((sum, r) => sum + BigInt(r.power), 0n);
    const totals = combineTotals(encryptedTally.aggregates(proposal), partials, bound);
    if (totals.some((t) => t === null)) throw new Error('The totals did not decrypt within the census bound.');
    const unit = 10n ** BigInt(config.nox.decimals);
    const voters = sql.get('SELECT COUNT(*) AS n FROM encrypted_ballots WHERE proposal_id = ?', proposal.id).n;
    const result = { totals: totals.map((t) => String(t * unit)), voters, decryptedBy: partials.map((p) => p.position) };
    sql.run('UPDATE proposals SET result = ? WHERE id = ? AND result IS NULL', JSON.stringify(result), proposal.id);
    return result;
  },
};

export default encryptedTally;
