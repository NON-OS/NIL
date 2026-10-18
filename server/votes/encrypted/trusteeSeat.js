import sql from '../../db/sql.js';
import HttpError from '../../lib/HttpError.js';

// The encrypted vote a request names and the caller's seat among its trustees.
export default function trusteeSeat(req) {
  const proposal = sql.get('SELECT * FROM proposals WHERE id = ? AND anonymous = 1 AND weighting = ?', req.params.id, 'power');
  if (!proposal) throw HttpError.notFound('That encrypted vote');
  const trustee = sql.get('SELECT * FROM proposal_trustees WHERE proposal_id = ? AND user_id = ?', proposal.id, req.user.id);
  if (!trustee) throw HttpError.forbidden('Only this vote’s trustees can do that.');
  return { proposal, trustee };
}
