import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import challenges from '../auth/challenges.js';
import clientKey from '../auth/clientKey.js';
import relyingParty from '../auth/relyingParty.js';
import siwe from '../auth/siwe.js';
import walletSignature from '../auth/walletSignature.js';
import config from '../config.js';
import notify from '../services/notify.js';
import listedBounties from '../services/listedBounties.js';
import publicWorkspace from '../services/publicWorkspace.js';

const router = express.Router();
router.use('/public/bounties', rateLimit({ windowMs: 15 * 60_000, max: 120 }));

function listed(id) {
  const item = listedBounties().items.find((b) => b.id === id);
  if (!item) throw HttpError.notFound('That bounty');
  return item;
}

router.get('/public/bounties', route(() => listedBounties()));

// Step 1: the server writes the exact message the applicant's wallet signs. Applying creates
// no account; the signature only proves the applicant controls the address they'd be paid at.
router.post(
  '/public/bounties/:id/challenge',
  route((req) => {
    const item = listed(req.params.id);
    const { address } = req.body ?? {};
    if (!siwe.isAddress(address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
    const name = check.text(req.body.name, 'Name', { min: 1, max: 80 });
    const pitch = check.text(req.body.pitch, 'Pitch', { max: 1500 });
    if (sql.get("SELECT COUNT(*) AS n FROM applications WHERE address = ? AND status = 'pending'", address.toLowerCase()).n >= 5) {
      throw HttpError.badRequest('This wallet already has 5 applications waiting here.');
    }
    const rp = relyingParty(req);
    const now = new Date();
    const message = siwe.message({
      host: rp.host,
      origin: rp.origin,
      address,
      statement: `Apply for ${item.ref} “${item.title.slice(0, 80)}” in ${publicWorkspace().name} as ${name}. This is not a transaction and costs nothing.`,
      nonce: crypto.randomBytes(12).toString('hex'),
      chainId: config.nox.chainId,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    });
    return { challengeId: challenges.issue('apply', { taskId: item.id, address: address.toLowerCase(), name, pitch, message }, clientKey(req.ip)), message };
  }),
);

// Step 2: check the signature, then file the application for the team to decide on.
router.post(
  '/public/bounties/:id/apply',
  route(async (req) => {
    const pending = challenges.take(req.body?.challengeId, 'apply');
    if (!pending || pending.taskId !== req.params.id) throw HttpError.badRequest('That request expired. Apply again.');
    await walletSignature(pending.address, pending.message, req.body?.signature);
    const item = listed(pending.taskId);
    if (sql.get('SELECT 1 FROM applications WHERE task_id = ? AND address = ?', item.id, pending.address)) throw new HttpError(409, 'This wallet already applied for this bounty.');
    if (sql.get('SELECT COUNT(*) AS n FROM applications WHERE task_id = ?', item.id).n >= 100) throw HttpError.badRequest('This bounty has all the applications it can take.');
    sql.run('INSERT INTO applications (id, task_id, address, name, pitch, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), item.id, pending.address, pending.name, pending.pitch, Date.now());
    const admins = sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin') AND deactivated = 0").map((u) => u.id);
    notify(admins, 'application', item.id, null, { title: item.title, name: pending.name });
    return { ok: true };
  }),
);

export default router;
