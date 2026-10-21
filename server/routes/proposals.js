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
import hub from '../realtime/hub.js';
import notify from '../services/notify.js';
import voteMessage from '../services/voteMessage.js';
import snapshotPower from '../services/snapshotPower.js';
import ballotSigner from '../services/ballotSigner.js';
import zspPower from '../services/zspPower.js';
import closeProposal from '../services/closeProposal.js';
import publicWorkspace from '../services/publicWorkspace.js';
import toProposal from '../mappers/toProposal.js';
import config from '../config.js';
import voterGroups from '../votes/voterGroups.js';
import heldBallots from '../votes/heldBallots.js';
import voteAudit from '../votes/voteAudit.js';
import memberPower from '../votes/memberPower.js';
import dropOutsideBallots from '../votes/dropOutsideBallots.js';
import oneLine from '../lib/oneLine.js';

const router = express.Router();
const DAY = 86_400_000;

// The title and options go into the text a wallet signs, so each has to stay on one line.
function plainLine(text, what) {
  if (oneLine.has(text)) throw HttpError.badRequest(`${what} has to be plain text on one line.`);
  return text;
}

function openProposal(id) {
  const row = sql.get('SELECT * FROM proposals WHERE id = ?', id);
  if (!row) throw HttpError.notFound('That vote');
  if (row.closed_at || row.closes_at < Date.now()) throw HttpError.badRequest('This vote has closed.');
  return row;
}

router.get(
  '/proposals',
  route((req) => {
    // anonymous ballots whose hour has ended join the count when someone next looks
    if (heldBallots.release()) hub.broadcast({ type: 'proposals' });
    voterGroups.blurTimes();
    return sql.all('SELECT * FROM proposals ORDER BY closed_at IS NOT NULL, created_at DESC LIMIT 200').map((row) => toProposal(row, req.user));
  }),
);

router.post(
  '/proposals',
  requireAdmin,
  route(async (req) => {
    const b = req.body ?? {};
    const title = plainLine(check.text(b.title, 'Title', { min: 1, max: 200 }), 'The question');
    const options = (Array.isArray(b.options) && b.options.length ? b.options : ['Yes', 'No', 'Abstain']).map((o) => plainLine(check.text(o, 'Option', { min: 1, max: 80 }), 'An option'));
    if (options.length < 2 || options.length > 8) throw HttpError.badRequest('A vote needs between 2 and 8 options.');
    // no two options may read alike in the signed text either
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw HttpError.badRequest('Each option needs different wording.');
    const weighting = check.oneOf(b.weighting ?? 'equal', ['equal', 'power'], 'Weighting');
    if (weighting === 'power' && !config.nox.enabled) throw HttpError.badRequest('Votes weighted by voting power need on-chain features, which are off on this server.');
    const days = check.number(b.days ?? 7, 'Duration', { min: 1, max: 60, integer: true });
    const anonymous = Boolean(b.anonymous);
    // who voted what, shown to every member: signed votes only, and only when asked for, so a
    // caller that doesn't know the setting keeps the old rule of admins only
    // a public vote: any NOX holder can vote on its own page and anyone can watch. Only signed
    // votes weighted by power, since the power is what makes an outside wallet's ballot count.
    const publicVote = b.publicVote === true;
    if (publicVote && !config.power.publicVotes) throw HttpError.forbidden(`Votes open to every ${config.nox.symbol} holder can only be started from an official workspace on this server.`);
    if (publicVote && (anonymous || weighting !== 'power')) throw HttpError.badRequest('A public vote is a signed vote weighted by voting power: turn off anonymous ballots and count voting power.');
    const publicBallots = publicVote || (!anonymous && b.publicBallots === true);
    // anonymous and weighted: encrypted ballots, decrypted only as totals by two of three
    // trustees. Without them the vote key could never be set up and the vote would never open.
    const trustees = anonymous && weighting === 'power' ? b.trustees : null;
    if (anonymous && weighting === 'power') {
      const valid = Array.isArray(trustees) && trustees.length === 3 && new Set(trustees).size === 3 && trustees.every((t) => typeof t === 'string');
      const eligible = valid && trustees.every((t) => sql.get("SELECT 1 FROM users u JOIN encryption_keys k ON k.user_id = u.id WHERE u.id = ? AND u.deactivated = 0 AND u.role != 'guest' AND u.kind = 'human'", t));
      if (!eligible) throw HttpError.badRequest('Pick three different members who have unlocked encrypted docs as trustees.');
    }
    const body = check.text(b.body, 'Details', { max: 10_000 });
    // No snapshot, no vote: a weighted vote without one couldn't be counted fairly. The power is
    // read before anything is saved, and the vote, its snapshot, its census and its trustees go
    // in together, so a failure or a restart midway leaves no vote nobody can count.
    const savePower = weighting === 'power' ? await snapshotPower() : null;
    const id = newId();
    const now = Date.now();
    sql.tx(() => {
      sql.run(
        'INSERT INTO proposals (id, title, body, options, weighting, sealed, anonymous, public_ballots, public_slug, created_by, created_at, closes_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, title, body, JSON.stringify(options), weighting, b.sealed ? 1 : 0, anonymous ? 1 : 0, publicBallots ? 1 : 0, publicVote ? crypto.randomBytes(16).toString('base64url') : null, req.user.id, now, now + days * DAY,
      );
      savePower?.(id);
      // the census of an anonymous vote needs the snapshot first when it's weighted
      if (anonymous) voterGroups.start(id);
      if (trustees) trustees.forEach((userId, i) => sql.run('INSERT INTO proposal_trustees (proposal_id, position, user_id) VALUES (?, ?, ?)', id, i + 1, userId));
      // votes are for members; guests can't open them and agents can't vote, so neither hears about them
      const members = sql.all("SELECT id FROM users WHERE deactivated = 0 AND role != 'guest' AND kind = 'human'").map((u) => u.id);
      notify(members, 'proposal', null, req.user.id, { proposalId: id, title });
    });
    hub.broadcast({ type: 'proposals' });
    return { proposal: toProposal(sql.get('SELECT * FROM proposals WHERE id = ?', id), req.user) };
  }),
);

// Step 1 of voting: the server writes the ballot text for the voter's wallet to sign.
router.post(
  '/proposals/:id/ballot',
  route((req) => {
    const proposal = openProposal(req.params.id);
    if (proposal.anonymous) throw HttpError.badRequest('This vote is anonymous: ballots are proofs, not signatures.');
    const options = parseJSON(proposal.options, []);
    const choice = check.number(req.body?.choice, 'Choice', { min: 0, max: options.length - 1, integer: true });
    if (choice === null) throw HttpError.badRequest('Pick an option.');
    const message = voteMessage({
      workspace: publicWorkspace().name,
      proposal,
      options,
      choice,
      userId: req.user.id,
      nonce: crypto.randomBytes(12).toString('hex'),
      issuedAt: new Date().toISOString(),
    });
    return { ballotId: challenges.issue('vote', { proposalId: proposal.id, userId: req.user.id, choice, message }, `user:${req.user.id}`), message };
  }),
);

// Step 2: the signature must come from one of the voter's own linked wallets. A smart wallet
// can't be recovered from its signature, so the browser also says which wallet signed.
router.post(
  '/proposals/:id/vote',
  route(async (req) => {
    const ballot = challenges.take(req.body?.ballotId, 'vote');
    if (!ballot || ballot.proposalId !== req.params.id || ballot.userId !== req.user.id) throw HttpError.badRequest('That ballot expired. Vote again.');
    const proposal = openProposal(req.params.id);
    const signer = typeof req.body?.signature === 'string' ? await ballotSigner(req.user.id, ballot.message, req.body.signature, req.body?.address) : null;
    if (!signer) throw new HttpError(401, 'Sign the vote with a wallet linked to your account.');
    const weight = await memberPower(req.user.id, proposal);
    if (weight === '0') throw HttpError.forbidden(`This vote counts voting power from when it opened (${config.nox.symbol} held or staked, and Zero-State Passes), and you had none then.`);
    // a public vote's chain reads take a moment, so it may have closed meanwhile
    openProposal(proposal.id);
    sql.tx(() => {
      sql.run(
        `INSERT INTO votes (proposal_id, user_id, choice, weight, address, message, signature, checked_by, checked_block, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (proposal_id, user_id) DO UPDATE SET choice = excluded.choice, weight = excluded.weight, address = excluded.address,
           message = excluded.message, signature = excluded.signature, checked_by = excluded.checked_by, checked_block = excluded.checked_block, created_at = excluded.created_at`,
        proposal.id, req.user.id, ballot.choice, weight, signer.address, ballot.message, req.body.signature, signer.checkedBy, signer.block, Date.now(),
      );
      dropOutsideBallots(proposal.id, req.user.id);
    });
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

// Everything needed to recount independently (see voteAudit). Admins can always have it; every
// member can when the vote's ballots are public. A sealed vote's file waits for the close: its
// ballots would give away the running totals the seal hides.
router.get(
  '/proposals/:id/audit',
  route((req) => {
    heldBallots.release({ proposalId: req.params.id });
    const row = sql.get('SELECT * FROM proposals WHERE id = ?', req.params.id);
    if (!row) throw HttpError.notFound('That vote');
    if (!req.user.isAdmin && !row.public_ballots) throw HttpError.forbidden('Only admins can download this vote’s audit file.');
    if (row.sealed && !row.closed_at) throw new HttpError(409, 'This vote is sealed, so its audit file is ready once it closes.');
    return voteAudit(row);
  }),
);

// How much voting power one ZSP carries, in whole NOX. New votes snapshot the value in force.
router.get('/vote-power', route(() => ({ zspPower: zspPower.get(), staking: config.power.staking, zsp: config.power.zsp })));
router.put(
  '/vote-power',
  requireAdmin,
  route((req) => {
    const value = String(req.body?.zspPower ?? '').trim();
    if (!/^\d{1,15}$/.test(value)) throw HttpError.badRequest('Power per Zero-State Pass must be a whole number of NOX.');
    return { zspPower: zspPower.set(value) };
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
