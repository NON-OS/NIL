import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import { addPoint } from '@zk-kit/baby-jubjub';
import parseReveal from '../votes/encrypted/parseReveal.js';
import checkPartial from '../votes/encrypted/checkPartial.js';
import encryptedTally from '../votes/encrypted/encryptedTally.js';
import trusteeSeat from '../votes/encrypted/trusteeSeat.js';
import trusteeSigned from '../votes/encrypted/trusteeSigned.js';
import trusteeStatement from '../votes/encrypted/trusteeStatement.js';

const router = express.Router();
const COMMITMENT = /^[0-9a-f]{64}$/;

const seats = (proposalId) => sql.all('SELECT position, commitment, dealing FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', proposalId);

// Step 1 of the key setup: each trustee commits to a hash of their coefficient commitments,
// signed with their own signing key so the server can't commit for them. A commitment can't be
// changed, so nobody can wait to see the others' and adjust their own.
router.put(
  '/proposals/:id/commitment',
  route((req) => {
    const { proposal, trustee } = trusteeSeat(req);
    const { commitment, signature } = req.body ?? {};
    if (typeof commitment !== 'string' || !COMMITMENT.test(commitment)) throw HttpError.badRequest('That isn’t a dealing commitment.');
    if (trustee.commitment) {
      if (trustee.commitment === commitment) return { ok: true };
      throw new HttpError(409, 'You already committed to a dealing for this vote.');
    }
    if (proposal.public_key) throw new HttpError(409, 'The trustees have already set up this vote’s key.');
    if (!trusteeSigned(req.user.id, trusteeStatement.commit(proposal.id, trustee.position, req.user.id, commitment), signature)) throw HttpError.badRequest('That commitment isn’t signed with your signing key.');
    sql.run('UPDATE proposal_trustees SET commitment = ?, commit_signature = ? WHERE proposal_id = ? AND position = ? AND commitment IS NULL', commitment, signature, proposal.id, trustee.position);
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

// Step 2, once all three have committed: a trustee's signed dealing. Commitments to a random
// line f(x) = a0 + a1·x that match the earlier hash, a proof of knowledge for each, and f(j)
// sealed to each trustee j. Once all three have revealed, the vote key is Σ a0·G and nobody,
// trustees included, ever holds its private half: any two can decrypt together, none alone.
router.put(
  '/proposals/:id/dealing',
  route((req) => {
    const { proposal, trustee } = trusteeSeat(req);
    if (proposal.public_key || trustee.dealing) throw new HttpError(409, 'Your dealing for this vote is already in.');
    if (!trustee.commitment) throw new HttpError(409, 'Commit to your dealing first.');
    if (!seats(proposal.id).every((t) => t.commitment)) throw new HttpError(409, 'Wait until all three trustees have committed.');
    const dealing = parseReveal(proposal.id, trustee, req.body);
    // the last dealing and the vote's key go in together: a dealing saved without the key would
    // leave the vote waiting forever, since a dealing can't be sent twice
    sql.tx(() => {
      sql.run('UPDATE proposal_trustees SET dealing = ?, dealt_at = ? WHERE proposal_id = ? AND position = ?', JSON.stringify(dealing), Date.now(), proposal.id, trustee.position);
      const dealings = encryptedTally.dealingsOf(proposal.id);
      if (dealings.every(Boolean)) {
        const key = dealings.reduce((sum, d) => addPoint(sum, d[0]), [0n, 1n]);
        sql.run('UPDATE proposals SET public_key = ? WHERE id = ? AND public_key IS NULL', JSON.stringify(key.map(String)), proposal.id);
      }
    });
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

// Once the vote closes, every ballot as it was cast, for each trustee's browser to check and add
// up itself before it decrypts anything. A trustee never takes the server's word for the sums.
router.get(
  '/proposals/:id/ballots',
  route((req) => {
    const { proposal } = trusteeSeat(req);
    if (!proposal.closed_at) throw HttpError.badRequest('The ballots go to the trustees once the vote closes.');
    return {
      ballots: sql.all('SELECT proof FROM encrypted_ballots WHERE proposal_id = ? ORDER BY nullifier', proposal.id).map((b) => JSON.parse(b.proof)),
      // every root ballots were proven against while it was open
      roots: sql.all('SELECT root FROM proposal_roots WHERE proposal_id = ? ORDER BY created_at', proposal.id).map((r) => r.root),
    };
  }),
);

// After the vote closes, a trustee's partial decryption of every option's summed ciphertext,
// each with a proof it used their real share. The second valid one decrypts the totals.
router.post(
  '/proposals/:id/partial',
  route((req) => {
    const { proposal, trustee } = trusteeSeat(req);
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
