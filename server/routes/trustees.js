import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import { addPoint } from '@zk-kit/baby-jubjub';
import parseReveal from '../votes/encrypted/parseReveal.js';
import checkPartial from '../votes/encrypted/checkPartial.js';
import encryptedTally from '../votes/encrypted/encryptedTally.js';

const router = express.Router();
const COMMITMENT = /^[0-9a-f]{64}$/;

function seat(req) {
  const proposal = sql.get('SELECT * FROM proposals WHERE id = ? AND anonymous = 1 AND weighting = ?', req.params.id, 'power');
  if (!proposal) throw HttpError.notFound('That encrypted vote');
  const trustee = sql.get('SELECT * FROM proposal_trustees WHERE proposal_id = ? AND user_id = ?', proposal.id, req.user.id);
  if (!trustee) throw HttpError.forbidden('Only this vote’s trustees can do that.');
  return { proposal, trustee };
}

const seats = (proposalId) => sql.all('SELECT position, commitment, dealing FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', proposalId);

// Step 1 of the key setup: each trustee commits to a hash of their coefficient commitments.
// A commitment can't be changed, so nobody can wait to see the others' and adjust their own.
router.put(
  '/proposals/:id/commitment',
  route((req) => {
    const { proposal, trustee } = seat(req);
    const commitment = req.body?.commitment;
    if (typeof commitment !== 'string' || !COMMITMENT.test(commitment)) throw HttpError.badRequest('That isn’t a dealing commitment.');
    if (trustee.commitment) {
      if (trustee.commitment === commitment) return { ok: true };
      throw new HttpError(409, 'You already committed to a dealing for this vote.');
    }
    if (proposal.public_key) throw new HttpError(409, 'The trustees have already set up this vote’s key.');
    sql.run('UPDATE proposal_trustees SET commitment = ? WHERE proposal_id = ? AND position = ? AND commitment IS NULL', commitment, proposal.id, trustee.position);
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

// Step 2, once all three have committed: a trustee's dealing. Commitments to a random line
// f(x) = a0 + a1·x that match the earlier hash, a proof of knowledge for each, and f(j) sealed
// to each trustee j. Once all three have revealed, the vote key is Σ a0·G and nobody, trustees
// included, ever holds its private half: any two can decrypt together, none alone.
router.put(
  '/proposals/:id/dealing',
  route((req) => {
    const { proposal, trustee } = seat(req);
    if (proposal.public_key || trustee.dealing) throw new HttpError(409, 'Your dealing for this vote is already in.');
    if (!trustee.commitment) throw new HttpError(409, 'Commit to your dealing first.');
    if (!seats(proposal.id).every((t) => t.commitment)) throw new HttpError(409, 'Wait until all three trustees have committed.');
    const dealing = parseReveal(proposal.id, trustee, req.body);
    sql.run('UPDATE proposal_trustees SET dealing = ?, dealt_at = ? WHERE proposal_id = ? AND position = ?', JSON.stringify(dealing), Date.now(), proposal.id, trustee.position);

    const dealings = encryptedTally.dealingsOf(proposal.id);
    if (dealings.every(Boolean)) {
      const key = dealings.reduce((sum, d) => addPoint(sum, d[0]), [0n, 1n]);
      sql.run('UPDATE proposals SET public_key = ? WHERE id = ? AND public_key IS NULL', JSON.stringify(key.map(String)), proposal.id);
    }
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

// Step 3: each trustee's browser opens the shares sealed to it and checks them against the
// dealers' commitments as soon as the key is set up, before anyone votes. A bad share would
// make the totals impossible to decrypt later, so a report of one stops the vote taking ballots.
router.post(
  '/proposals/:id/shares-check',
  route((req) => {
    const { proposal, trustee } = seat(req);
    if (!proposal.public_key) throw new HttpError(409, 'The vote key isn’t set up yet.');
    const from = req.body?.ok === true ? null : Number(req.body?.from);
    if (from !== null && ![1, 2, 3].includes(from)) throw HttpError.badRequest('Say which trustee’s share failed.');
    if (trustee.shares_check) return { ok: true };
    sql.run('UPDATE proposal_trustees SET shares_check = ? WHERE proposal_id = ? AND position = ?', from === null ? 'ok' : `bad:${from}`, proposal.id, trustee.position);
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
    const partial = { d: req.body.d, proofs: req.body.proofs.map(({ t1, t2, z }) => ({ t1, t2, z })) };
    sql.run('UPDATE proposal_trustees SET partial = ?, partial_at = ? WHERE proposal_id = ? AND position = ?', JSON.stringify(partial), Date.now(), proposal.id, trustee.position);
    encryptedTally.finish(proposal);
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

export default router;
