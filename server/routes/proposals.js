import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import parseJSON from '../lib/parseJSON.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import challenges from '../auth/challenges.js';
import siwe from '../auth/siwe.js';
import hub from '../realtime/hub.js';
import notify from '../services/notify.js';
import voteMessage from '../services/voteMessage.js';
import voteWeight from '../services/voteWeight.js';
import closeProposal from '../services/closeProposal.js';
import publicWorkspace from '../services/publicWorkspace.js';
import toProposal from '../mappers/toProposal.js';
import config from '../config.js';

const router = express.Router();
const DAY = 86_400_000;

function openProposal(id) {
  const row = sql.get('SELECT * FROM proposals WHERE id = ?', id);
  if (!row) throw HttpError.notFound('That vote');
  if (row.closed_at || row.closes_at < Date.now()) throw HttpError.badRequest('This vote has closed.');
  return row;
}

router.get(
  '/proposals',
  route((req) => sql.all('SELECT * FROM proposals ORDER BY closed_at IS NOT NULL, created_at DESC LIMIT 200').map((row) => toProposal(row, req.user))),
);

router.post(
  '/proposals',
  requireAdmin,
  route((req) => {
    const b = req.body ?? {};
    const options = (Array.isArray(b.options) && b.options.length ? b.options : ['Yes', 'No', 'Abstain']).map((o) => check.text(o, 'Option', { min: 1, max: 80 }));
    if (options.length < 2 || options.length > 8) throw HttpError.badRequest('A vote needs between 2 and 8 options.');
    const weighting = check.oneOf(b.weighting ?? 'equal', ['equal', 'nox'], 'Weighting');
    if (weighting === 'nox' && !config.nox.enabled) throw HttpError.badRequest(`${config.nox.symbol}-weighted votes need on-chain features, which are off on this server.`);
    const days = check.number(b.days ?? 7, 'Duration', { min: 1, max: 60, integer: true });
    const id = newId();
    const now = Date.now();
    sql.run(
      'INSERT INTO proposals (id, title, body, options, weighting, sealed, created_by, created_at, closes_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, check.text(b.title, 'Title', { min: 1, max: 200 }), check.text(b.body, 'Details', { max: 10_000 }), JSON.stringify(options), weighting, b.sealed ? 1 : 0, req.user.id, now, now + days * DAY,
    );
    const everyone = sql.all('SELECT id FROM users WHERE deactivated = 0').map((u) => u.id);
    notify(everyone, 'proposal', null, req.user.id, { proposalId: id, title: b.title });
    hub.broadcast({ type: 'proposals' });
    return { proposal: toProposal(sql.get('SELECT * FROM proposals WHERE id = ?', id), req.user) };
  }),
);

// Step 1 of voting: the server writes the ballot text for the voter's wallet to sign.
router.post(
  '/proposals/:id/ballot',
  route((req) => {
    const proposal = openProposal(req.params.id);
    const options = parseJSON(proposal.options, []);
    const choice = check.number(req.body?.choice, 'Choice', { min: 0, max: options.length - 1, integer: true });
    if (choice === null) throw HttpError.badRequest('Pick an option.');
    const message = voteMessage({
      workspace: publicWorkspace().name,
      proposal,
      choice: options[choice],
      userId: req.user.id,
      nonce: crypto.randomBytes(12).toString('hex'),
      issuedAt: new Date().toISOString(),
    });
    return { ballotId: challenges.issue('vote', { proposalId: proposal.id, userId: req.user.id, choice, message }), message };
  }),
);

// Step 2: the signature must come from one of the voter's own linked wallets.
router.post(
  '/proposals/:id/vote',
  route(async (req) => {
    const ballot = challenges.take(req.body?.ballotId, 'vote');
    if (!ballot || ballot.proposalId !== req.params.id || ballot.userId !== req.user.id) throw HttpError.badRequest('That ballot expired. Vote again.');
    const proposal = openProposal(req.params.id);
    const address = siwe.recover(ballot.message, req.body?.signature);
    if (!address || !sql.get("SELECT 1 FROM credentials WHERE user_id = ? AND kind = 'wallet' AND external_id = ?", req.user.id, address)) {
      throw new HttpError(401, 'Sign the vote with a wallet linked to your account.');
    }
    const weight = await voteWeight(req.user.id, proposal.weighting);
    if (weight === '0') throw HttpError.forbidden(`This vote is weighted by ${config.nox.symbol}, and your linked wallets hold none.`);
    sql.run(
      `INSERT INTO votes (proposal_id, user_id, choice, weight, address, message, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (proposal_id, user_id) DO UPDATE SET choice = excluded.choice, weight = excluded.weight, address = excluded.address,
         message = excluded.message, signature = excluded.signature, created_at = excluded.created_at`,
      proposal.id, req.user.id, ballot.choice, weight, address, ballot.message, req.body.signature, Date.now(),
    );
    hub.broadcast({ type: 'proposals' });
    return { proposal: toProposal(sql.get('SELECT * FROM proposals WHERE id = ?', proposal.id), req.user) };
  }),
);

router.post(
  '/proposals/:id/close',
  requireAdmin,
  route(async (req) => {
    if (!sql.get('SELECT 1 FROM proposals WHERE id = ?', req.params.id)) throw HttpError.notFound('That vote');
    await closeProposal(req.params.id);
    return { proposal: toProposal(sql.get('SELECT * FROM proposals WHERE id = ?', req.params.id), req.user) };
  }),
);

// Everything needed to recount independently: each signed ballot and the weight it got.
router.get(
  '/proposals/:id/audit',
  requireAdmin,
  route((req) => {
    const row = sql.get('SELECT * FROM proposals WHERE id = ?', req.params.id);
    if (!row) throw HttpError.notFound('That vote');
    return {
      type: 'nonos.vote-audit',
      v: 1,
      proposal: { id: row.id, title: row.title, options: parseJSON(row.options, []), weighting: row.weighting, closesAt: row.closes_at, closedAt: row.closed_at, result: parseJSON(row.result, null) },
      token: row.weighting === 'nox' ? { chainId: config.nox.chainId, address: config.nox.token, symbol: config.nox.symbol, decimals: config.nox.decimals } : null,
      ballots: sql.all('SELECT address, choice, weight, final_weight, message, signature, created_at FROM votes WHERE proposal_id = ? ORDER BY created_at', row.id).map((v) => ({
        address: v.address,
        choice: v.choice,
        weightWhenCast: v.weight,
        weightCounted: v.final_weight ?? v.weight,
        message: v.message,
        signature: v.signature,
        castAt: new Date(v.created_at).toISOString(),
      })),
    };
  }),
);

router.delete(
  '/proposals/:id',
  requireAdmin,
  route((req) => {
    sql.run('DELETE FROM proposals WHERE id = ?', req.params.id);
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

export default router;
