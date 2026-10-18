import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import parseJSON from '../lib/parseJSON.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import heldBallots from '../votes/heldBallots.js';
import checkBallot from '../votes/checkBallot.js';
import checkEncryptedBallot from '../votes/encrypted/checkEncryptedBallot.js';
import anonymousView from '../votes/anonymousView.js';

const router = express.Router();

// The voter list and everything else a ballot is proven from, for browsers that ask without
// their cookie (see anonymousView). Knowing the vote's id is what lets anyone ask.
router.get(
  '/anonymous-votes/:id',
  rateLimit({ windowMs: 60_000, max: 60, message: 'Too many requests at once. Wait a minute.' }),
  route((req) => {
    const proposal = sql.get('SELECT * FROM proposals WHERE id = ? AND anonymous = 1', req.params.id);
    if (!proposal) throw HttpError.notFound('That vote');
    return anonymousView(proposal);
  }),
);

// Mounted before sign-in on purpose: browsers send these without the session cookie, so the
// server can't tie a ballot to an account. The proof alone decides whether it counts. A valid
// ballot is held until its hour ends (see heldBallots), so nothing anyone can see changes now.
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
      const { nullifier, ciphertexts, proof } = await checkEncryptedBallot(proposal, parseJSON(proposal.options, []), req.body);
      // the ballot circuit has no field for the hour, so an encrypted ballot can't be replaced
      // safely: the first one each voter casts is final
      const countsAt = heldBallots.hold(proposal.id, nullifier, { ciphertexts, proof }, { final: true });
      return { ok: true, countsAt };
    }
    const { choice, nullifier, hour, proof } = await checkBallot(proposal, parseJSON(proposal.options, []), req.body?.proof);
    // the same member voting again replaces their earlier choice, like signed ballots do
    const countsAt = heldBallots.hold(proposal.id, nullifier, { choice, proof }, { hour });
    return { ok: true, countsAt };
  }),
);

export default router;
