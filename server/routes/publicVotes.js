import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import parseJSON from '../lib/parseJSON.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import walletChallenges from '../auth/walletChallenges.js';
import clientKey from '../auth/clientKey.js';
import relyingParty from '../auth/relyingParty.js';
import siwe from '../auth/siwe.js';
import hub from '../realtime/hub.js';
import config from '../config.js';
import publicWorkspace from '../services/publicWorkspace.js';
import voteAudit from '../votes/voteAudit.js';
import publicVoteView from '../votes/publicVoteView.js';
import publicVoteMessage from '../votes/publicVoteMessage.js';
import castPublicBallot from '../votes/castPublicBallot.js';

// A ballot is an address, a choice, a challenge and a signature; a smart wallet's signature is the
// largest part and stays well under this.
const MAX_BODY = 40 * 1024;
const SLUG = /^[\w-]{22}$/;

const router = express.Router();
router.use('/public/votes', rateLimit({ windowMs: 15 * 60_000, max: 300 }));
// asking for and casting ballots costs the server chain reads, so those get a tighter allowance,
// counted by network like sign-in
const casting = rateLimit({ windowMs: 15 * 60_000, max: 30, message: 'Too many ballots from this network. Wait a few minutes and try again.' });
const small = (req, res, next) => (Number(req.headers['content-length'] ?? 0) > MAX_BODY ? res.status(413).json({ error: 'That request is too large.' }) : next());

function publicVote(slug) {
  const row = SLUG.test(slug) ? sql.get('SELECT * FROM proposals WHERE public_slug = ?', slug) : null;
  if (!row) throw HttpError.notFound('That vote');
  return row;
}

function mustBeOpen(row) {
  if (row.closed_at || row.closes_at < Date.now()) throw HttpError.badRequest('This vote has closed.');
}

// Public votes need no account and set no cookie. Their pages ask search engines to stay away,
// since the address is only shared by people who want it seen.
router.get(
  '/public/votes/:slug',
  route((req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return publicVoteView(publicVote(req.params.slug));
  }),
);

// Anyone can recount a public vote. A sealed one's file waits for the close, like in the app.
router.get(
  '/public/votes/:slug/audit',
  route((req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const row = publicVote(req.params.slug);
    if (row.sealed && !row.closed_at) throw new HttpError(409, 'This vote is sealed, so its audit file is ready once it closes.');
    return voteAudit(row);
  }),
);

// Step 1: the server writes the ballot text for the visitor's wallet to sign. The challenge holds
// the vote, the wallet, the choice and the text, signed by the server for this network only.
router.post(
  '/public/votes/:slug/challenge',
  small,
  casting,
  route((req) => {
    const row = publicVote(req.params.slug);
    mustBeOpen(row);
    const { address } = req.body ?? {};
    if (!siwe.isAddress(address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
    const options = parseJSON(row.options, []);
    const choice = check.number(req.body.choice, 'Choice', { min: 0, max: options.length - 1, integer: true });
    if (choice === null) throw HttpError.badRequest('Pick an option.');
    const wallet = address.toLowerCase();
    const message = publicVoteMessage({
      origin: relyingParty(req).origin,
      workspace: publicWorkspace()?.name ?? 'Nil',
      proposal: row,
      options,
      choice,
      address: wallet,
      chainId: config.nox.chainId,
      nonce: crypto.randomBytes(12).toString('hex'),
      issuedAt: new Date().toISOString(),
    });
    return { challengeId: walletChallenges.issue('public-vote', { proposalId: row.id, address: wallet, choice, message }, clientKey(req.ip)), message };
  }),
);

// Step 2: the signature has to come from the wallet named in the text. No account and no session
// come of it; the answer is the vote as anyone sees it.
router.post(
  '/public/votes/:slug/ballot',
  small,
  casting,
  route(async (req) => {
    const pending = walletChallenges.take(req.body?.challengeId, 'public-vote', clientKey(req.ip));
    const row = publicVote(req.params.slug);
    if (!pending || pending.proposalId !== row.id) throw HttpError.badRequest('That ballot expired. Vote again.');
    mustBeOpen(row);
    const counted = await castPublicBallot(row, pending, req.body.signature);
    hub.broadcast({ type: 'proposals' });
    return { counted, vote: publicVoteView(sql.get('SELECT * FROM proposals WHERE id = ?', row.id)) };
  }),
);

export default router;
