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
import snapshotPower from '../services/snapshotPower.js';
import zspPower from '../services/zspPower.js';
import closeProposal from '../services/closeProposal.js';
import publicWorkspace from '../services/publicWorkspace.js';
import toProposal from '../mappers/toProposal.js';
import config from '../config.js';
import voterGroups from '../votes/voterGroups.js';
import voteScope from '../votes/voteScope.js';
import heldBallots from '../votes/heldBallots.js';
import fieldHash from '../votes/fieldHash.js';

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
  route((req) => {
    // anonymous ballots whose hour has ended join the count when someone next looks
    if (heldBallots.release()) hub.broadcast({ type: 'proposals' });
    return sql.all('SELECT * FROM proposals ORDER BY closed_at IS NOT NULL, created_at DESC LIMIT 200').map((row) => toProposal(row, req.user));
  }),
);

router.post(
  '/proposals',
  requireAdmin,
  route(async (req) => {
    const b = req.body ?? {};
    const options = (Array.isArray(b.options) && b.options.length ? b.options : ['Yes', 'No', 'Abstain']).map((o) => check.text(o, 'Option', { min: 1, max: 80 }));
    if (options.length < 2 || options.length > 8) throw HttpError.badRequest('A vote needs between 2 and 8 options.');
    const weighting = check.oneOf(b.weighting ?? 'equal', ['equal', 'power'], 'Weighting');
    if (weighting === 'power' && !config.nox.enabled) throw HttpError.badRequest('Votes weighted by voting power need on-chain features, which are off on this server.');
    const days = check.number(b.days ?? 7, 'Duration', { min: 1, max: 60, integer: true });
    const anonymous = Boolean(b.anonymous);
    // anonymous and weighted: encrypted ballots, decrypted only as totals by two of three trustees
    const trustees = anonymous && weighting === 'power' ? b.trustees : null;
    if (trustees) {
      const valid = Array.isArray(trustees) && trustees.length === 3 && new Set(trustees).size === 3 && trustees.every((t) => typeof t === 'string');
      const eligible = valid && trustees.every((t) => sql.get("SELECT 1 FROM users u JOIN encryption_keys k ON k.user_id = u.id WHERE u.id = ? AND u.deactivated = 0 AND u.role != 'guest'", t));
      if (!eligible) throw HttpError.badRequest('Pick three different members who have unlocked encrypted docs as trustees.');
      if (options.length > 8) throw HttpError.badRequest('Encrypted votes can have at most 8 options.');
    }
    const id = newId();
    const now = Date.now();
    sql.run(
      'INSERT INTO proposals (id, title, body, options, weighting, sealed, anonymous, created_by, created_at, closes_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, check.text(b.title, 'Title', { min: 1, max: 200 }), check.text(b.body, 'Details', { max: 10_000 }), JSON.stringify(options), weighting, b.sealed ? 1 : 0, anonymous ? 1 : 0, req.user.id, now, now + days * DAY,
    );
    if (weighting === 'power') {
      try {
        await snapshotPower(id);
      } catch (err) {
        // no snapshot, no vote: a weighted vote without one couldn't be counted fairly
        sql.run('DELETE FROM proposals WHERE id = ?', id);
        throw err;
      }
    }
    // the census of an anonymous vote needs the snapshot first when it's weighted
    if (anonymous) voterGroups.start(id);
    if (trustees) trustees.forEach((userId, i) => sql.run('INSERT INTO proposal_trustees (proposal_id, position, user_id) VALUES (?, ?, ?)', id, i + 1, userId));
    // votes are for members; guests can't open them, so they don't hear about them either
    const members = sql.all("SELECT id FROM users WHERE deactivated = 0 AND role != 'guest'").map((u) => u.id);
    notify(members, 'proposal', null, req.user.id, { proposalId: id, title: b.title });
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
      choice: options[choice],
      userId: req.user.id,
      nonce: crypto.randomBytes(12).toString('hex'),
      issuedAt: new Date().toISOString(),
    });
    return { ballotId: challenges.issue('vote', { proposalId: proposal.id, userId: req.user.id, choice, message }, `user:${req.user.id}`), message };
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
    const weight = voteWeight(req.user.id, proposal);
    if (weight === '0') throw HttpError.forbidden(`This vote counts voting power from when it opened (${config.nox.symbol} held or staked, and Zero-State Passes), and you had none then.`);
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
    heldBallots.release({ proposalId: req.params.id });
    const row = sql.get('SELECT * FROM proposals WHERE id = ?', req.params.id);
    if (!row) throw HttpError.notFound('That vote');
    // anyone can recount an anonymous vote: check each proof against an accepted root, that
    // every nullifier appears once, and the scope. Names never appear because they're never known.
    // Ballots list in nullifier order and carry only the hour they were cast in, so neither
    // their order nor their time can be matched with who was online.
    if (row.anonymous && row.weighting === 'power') {
      return {
        type: 'nonos.encrypted-vote-audit',
        v: 1,
        proposal: { id: row.id, title: row.title, options: parseJSON(row.options, []), closesAt: row.closes_at, closedAt: row.closed_at, result: parseJSON(row.result, null) },
        circuit: { name: 'circuits/ballot.circom', depth: 16, scope: fieldHash(voteScope(row.id)) },
        power: { block: row.snapshot_block, zspPower: row.zsp_power, unit: 'whole NOX' },
        census: voterGroups.members(row.id),
        roots: sql.all('SELECT root, revoked, created_at FROM proposal_roots WHERE proposal_id = ? ORDER BY created_at', row.id).map((r) => ({ root: r.root, revoked: Boolean(r.revoked), at: new Date(r.created_at).toISOString() })),
        publicKey: parseJSON(row.public_key, null),
        trustees: sql.all('SELECT position, commitment, dealing, partial FROM proposal_trustees WHERE proposal_id = ? ORDER BY position', row.id).map((t) => {
          const dealing = parseJSON(t.dealing, {});
          return { position: t.position, commitment: t.commitment, commitments: dealing.commitments ?? null, proofs: dealing.proofs ?? null, partial: parseJSON(t.partial, null) };
        }),
        ballots: sql.all('SELECT ciphertexts, proof, created_at FROM encrypted_ballots WHERE proposal_id = ? ORDER BY nullifier', row.id).map((b) => ({ ciphertexts: JSON.parse(b.ciphertexts), ...JSON.parse(b.proof), castAt: new Date(heldBallots.hourOf(b.created_at)).toISOString() })),
      };
    }
    if (row.anonymous) {
      return {
        type: 'nonos.anonymous-vote-audit',
        v: 1,
        proposal: { id: row.id, title: row.title, options: parseJSON(row.options, []), closesAt: row.closes_at, closedAt: row.closed_at, result: parseJSON(row.result, null) },
        semaphore: { version: '4', depth: config.semaphore.depth, scope: voteScope(row.id) },
        group: voterGroups.members(row.id),
        roots: sql.all('SELECT root, revoked, created_at FROM proposal_roots WHERE proposal_id = ? ORDER BY created_at', row.id).map((r) => ({ root: r.root, revoked: Boolean(r.revoked), at: new Date(r.created_at).toISOString() })),
        ballots: sql.all('SELECT choice, proof, created_at FROM anonymous_ballots WHERE proposal_id = ? ORDER BY nullifier', row.id).map((b) => ({ choice: b.choice, proof: JSON.parse(b.proof), castAt: new Date(heldBallots.hourOf(b.created_at)).toISOString() })),
      };
    }
    return {
      type: 'nonos.vote-audit',
      v: 1,
      proposal: { id: row.id, title: row.title, options: parseJSON(row.options, []), weighting: row.weighting, closesAt: row.closes_at, closedAt: row.closed_at, result: parseJSON(row.result, null) },
      power:
        row.weighting === 'power'
          ? {
              chainId: config.nox.chainId,
              block: row.snapshot_block,
              token: { address: config.nox.token, symbol: config.nox.symbol, decimals: config.nox.decimals },
              staking: config.power.staking,
              zsp: config.power.zsp,
              zspPower: row.zsp_power,
              members: sql.all('SELECT u.id, (SELECT group_concat(external_id) FROM credentials c WHERE c.user_id = u.id AND c.kind = \'wallet\') AS wallets, p.nox, p.staked, p.zsp, p.power FROM proposal_power p JOIN users u ON u.id = p.user_id WHERE p.proposal_id = ?', row.id)
                .map((m) => ({ wallets: (m.wallets ?? '').split(',').filter(Boolean), nox: m.nox, staked: m.staked, zsp: m.zsp, power: m.power })),
            }
          : null,
      ballots: sql.all('SELECT address, choice, weight, message, signature, created_at FROM votes WHERE proposal_id = ? ORDER BY created_at', row.id).map((v) => ({
        address: v.address,
        choice: v.choice,
        weight: v.weight,
        message: v.message,
        signature: v.signature,
        castAt: new Date(v.created_at).toISOString(),
      })),
    };
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
