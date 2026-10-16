import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import { addPoint } from '@zk-kit/baby-jubjub';
import curvePoint from '../votes/encrypted/curvePoint.js';
import checkPartial from '../votes/encrypted/checkPartial.js';
import encryptedTally from '../votes/encrypted/encryptedTally.js';

const router = express.Router();
const SEALED = /^[A-Za-z0-9_-]{100,200}$/;

function seat(req) {
  const proposal = sql.get('SELECT * FROM proposals WHERE id = ? AND anonymous = 1 AND weighting = ?', req.params.id, 'power');
  if (!proposal) throw HttpError.notFound('That encrypted vote');
  const trustee = sql.get('SELECT * FROM proposal_trustees WHERE proposal_id = ? AND user_id = ?', proposal.id, req.user.id);
  if (!trustee) throw HttpError.forbidden('Only this vote’s trustees can do that.');
  return { proposal, trustee };
}

// A trustee's dealing: commitments to a random line f(x) = a0 + a1·x and f(j) sealed to each
// trustee j's encryption key. Once all three have dealt, the vote key is Σ a0·G and nobody,
// trustees included, ever holds its private half: any two can decrypt together, none alone.
router.put(
  '/proposals/:id/dealing',
  route((req) => {
    const { proposal, trustee } = seat(req);
    if (proposal.public_key) throw new HttpError(409, 'The trustees have already set up this vote’s key.');
    const commitments = Array.isArray(req.body?.commitments) && req.body.commitments.length === 2 ? req.body.commitments.map(curvePoint) : null;
    const shares = req.body?.shares;
    if (!commitments || commitments.some((c) => !c)) throw HttpError.badRequest('Those commitments aren’t valid curve points.');
    if (!shares || ![1, 2, 3].every((j) => typeof shares[j] === 'string' && SEALED.test(shares[j]))) throw HttpError.badRequest('A dealing needs one sealed share for each trustee.');
    sql.run('UPDATE proposal_trustees SET dealing = ?, dealt_at = ? WHERE proposal_id = ? AND position = ?', JSON.stringify({ commitments: req.body.commitments, shares: { 1: shares[1], 2: shares[2], 3: shares[3] } }), Date.now(), proposal.id, trustee.position);

    const dealings = encryptedTally.dealingsOf(proposal.id);
    if (dealings.every(Boolean)) {
      const key = dealings.reduce((sum, d) => addPoint(sum, d[0]), [0n, 1n]);
      sql.run('UPDATE proposals SET public_key = ? WHERE id = ? AND public_key IS NULL', JSON.stringify(key.map(String)), proposal.id);
    }
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

// After the vote closes, a trustee's partial decryption of every option's summed ciphertext,
// each with a proof it used their real share. The second valid one decrypts the totals.
router.post(
  '/proposals/:id/partial',
  route((req) => {
    const { proposal, trustee } = seat(req);
    if (!proposal.closed_at) throw HttpError.badRequest('The totals can be decrypted once the vote closes.');
    if (proposal.result) return { ok: true };
    const checked = checkPartial(encryptedTally.publicShare(proposal.id, trustee.position), encryptedTally.aggregates(proposal), req.body);
    if (!checked) throw HttpError.badRequest('That partial decryption doesn’t check out against your public share.');
    sql.run('UPDATE proposal_trustees SET partial = ?, partial_at = ? WHERE proposal_id = ? AND position = ?', JSON.stringify(req.body), Date.now(), proposal.id, trustee.position);
    encryptedTally.finish(proposal);
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

export default router;
