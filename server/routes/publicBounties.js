import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import walletChallenges from '../auth/walletChallenges.js';
import clientKey from '../auth/clientKey.js';
import relyingParty from '../auth/relyingParty.js';
import siwe from '../auth/siwe.js';
import walletSignature from '../auth/walletSignature.js';
import config from '../config.js';
import notifyApplication from '../services/notifyApplication.js';
import listedBounties from '../services/listedBounties.js';
import publicWorkspace from '../services/publicWorkspace.js';

const HOUR = 3_600_000;
const router = express.Router();
router.use('/public/bounties', rateLimit({ windowMs: 15 * 60_000, max: 120 }));

// Text from the applicant or the team goes into the message the wallet signs on one line, so a
// line break can't add lines that look like the message's own fields.
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

function listed(id) {
  const item = listedBounties().items.find((b) => b.id === id);
  if (!item) throw HttpError.notFound('That bounty');
  return item;
}

// Whether a bounty takes one more application now, checked before the applicant signs and again
// once they have. Only applications still waiting count: once the team declines or deletes a
// pile of them, real applicants can get through again.
function takesApplications(item, res) {
  if (!item.acceptingApplications) throw new HttpError(409, 'This bounty isn’t taking new applications.');
  const { maxPending, perHour } = config.bountyBoard;
  if (sql.get("SELECT COUNT(*) AS n FROM applications WHERE task_id = ? AND status = 'pending'", item.id).n >= maxPending) {
    throw new HttpError(409, 'This bounty has as many applications waiting as it can take. Try again once the team has gone through them.');
  }
  const recent = sql.all("SELECT created_at FROM applications WHERE task_id = ? AND status = 'pending' AND created_at > ? ORDER BY created_at LIMIT ?", item.id, Date.now() - HOUR, perHour);
  if (recent.length >= perHour) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((recent[0].created_at + HOUR - Date.now()) / 1000)));
    throw new HttpError(429, 'This bounty got a lot of applications in the last hour. Try again in a while.');
  }
}

router.get('/public/bounties', route(() => listedBounties()));

// Step 1: the server writes the exact message the applicant's wallet signs. Applying creates
// no account; the signature only proves the applicant controls the address they'd be paid at.
router.post(
  '/public/bounties/:id/challenge',
  route((req, res) => {
    const item = listed(req.params.id);
    const { address } = req.body ?? {};
    if (!siwe.isAddress(address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
    const name = oneLine(check.text(req.body.name, 'Name', { min: 1, max: 80 }));
    const pitch = check.text(req.body.pitch, 'Pitch', { max: 1500 });
    const { perWallet } = config.bountyBoard;
    if (sql.get("SELECT COUNT(*) AS n FROM applications WHERE address = ? AND status = 'pending'", address.toLowerCase()).n >= perWallet) {
      throw HttpError.badRequest(`This wallet already has ${perWallet} application${perWallet === 1 ? '' : 's'} waiting here.`);
    }
    takesApplications(item, res);
    const rp = relyingParty(req);
    const now = new Date();
    const message = siwe.message({
      host: rp.host,
      origin: rp.origin,
      address,
      statement: `Apply for ${item.ref} “${oneLine(item.title).slice(0, 80)}” in ${oneLine(publicWorkspace().name) || 'Nil'} as ${name}. This is not a transaction and costs nothing.`,
      nonce: crypto.randomBytes(12).toString('hex'),
      chainId: config.nox.chainId,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    });
    return { challengeId: walletChallenges.issue('apply', { taskId: item.id, address: address.toLowerCase(), name, pitch, message }, clientKey(req.ip)), message };
  }),
);

// Step 2: check the signature, then file the application for the team to decide on.
router.post(
  '/public/bounties/:id/apply',
  route(async (req, res) => {
    const pending = walletChallenges.take(req.body?.challengeId, 'apply', clientKey(req.ip));
    if (!pending || pending.taskId !== req.params.id) throw HttpError.badRequest('That request expired. Apply again.');
    await walletSignature(pending.address, pending.message, req.body?.signature);
    const item = listed(pending.taskId);
    if (sql.get('SELECT 1 FROM applications WHERE task_id = ? AND address = ?', item.id, pending.address)) throw new HttpError(409, 'This wallet already applied for this bounty.');
    takesApplications(item, res);
    sql.run('INSERT INTO applications (id, task_id, address, name, pitch, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), item.id, pending.address, pending.name, pending.pitch, Date.now());
    notifyApplication(item.id, item.title, pending.name);
    return { ok: true };
  }),
);

export default router;
