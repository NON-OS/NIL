import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import parseJSON from '../lib/parseJSON.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import hub from '../realtime/hub.js';
import checkBallot from '../votes/checkBallot.js';
import checkEncryptedBallot from '../votes/encrypted/checkEncryptedBallot.js';

const router = express.Router();

// Mounted before sign-in on purpose: browsers send these without the session cookie, so the
// server can't tie a ballot to an account. The proof alone decides whether it counts.
router.post(
  '/anonymous-ballots/:id',
  rateLimit({ windowMs: 60_000, max: 30, message: 'Too many ballots at once. Wait a minute.' }),
  route(async (req) => {
    const proposal = sql.get('SELECT * FROM proposals WHERE id = ? AND anonymous = 1', req.params.id);
    if (!proposal) throw HttpError.notFound('That vote');
    if (proposal.closed_at || proposal.closes_at < Date.now()) throw HttpError.badRequest('This vote has closed.');
    if (proposal.weighting === 'power') {
      if (!proposal.public_key) throw HttpError.badRequest('This vote opens once its trustees have set up the key.');
      if (sql.get("SELECT 1 FROM proposal_trustees WHERE proposal_id = ? AND shares_check LIKE 'bad:%'", proposal.id)) {
        throw new HttpError(409, 'A trustee found a key share that doesn’t match its dealer’s commitment, so this vote can’t take ballots. Ask an admin to start it again.');
      }
      const { nullifier, ciphertexts } = await checkEncryptedBallot(proposal, parseJSON(proposal.options, []), req.body);
      sql.run(
        `INSERT INTO encrypted_ballots (proposal_id, nullifier, ciphertexts, proof, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (proposal_id, nullifier) DO UPDATE SET ciphertexts = excluded.ciphertexts, proof = excluded.proof, created_at = excluded.created_at`,
        proposal.id, nullifier, JSON.stringify(ciphertexts), JSON.stringify({ proof: req.body.proof, publicSignals: req.body.publicSignals }), Date.now(),
      );
      hub.broadcast({ type: 'proposals' });
      return { ok: true };
    }
    const { choice, nullifier } = await checkBallot(proposal, parseJSON(proposal.options, []), req.body?.proof);
    // the same member voting again replaces their earlier choice, like signed ballots do
    sql.run(
      `INSERT INTO anonymous_ballots (proposal_id, nullifier, choice, proof, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (proposal_id, nullifier) DO UPDATE SET choice = excluded.choice, proof = excluded.proof, created_at = excluded.created_at`,
      proposal.id, nullifier, choice, JSON.stringify(req.body.proof), Date.now(),
    );
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

export default router;
