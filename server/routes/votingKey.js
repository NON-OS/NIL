import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import publishUser from '../services/publishUser.js';
import voterGroups from '../votes/voterGroups.js';
import toUser from '../mappers/toUser.js';

const router = express.Router();
// the BN254 scalar field every Semaphore value lives in
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Your Semaphore identity commitment: the public half of your anonymous voting key. It joins
// you to every open anonymous vote, and to new ones as they start.
router.put(
  '/me/semaphore',
  route((req) => {
    const commitment = String(req.body?.commitment ?? '');
    if (!/^\d{1,78}$/.test(commitment) || BigInt(commitment) === 0n || BigInt(commitment) >= FIELD) throw HttpError.badRequest('That isn’t a voting key.');
    const current = sql.get('SELECT semaphore_commitment AS c FROM users WHERE id = ?', req.user.id).c;
    if (current === commitment) return { user: toUser(publishUser(req.user.id), req.viewer) };
    // a new key mid-vote would be a second identity, and a second ballot
    if (current && voterGroups.inOpenVote(current)) throw new HttpError(409, 'You can switch voting keys once the open anonymous votes close.');
    if (sql.get('SELECT 1 FROM users WHERE semaphore_commitment = ? AND id != ?', commitment, req.user.id)) throw new HttpError(409, 'That voting key belongs to someone else.');
    sql.run('UPDATE users SET semaphore_commitment = ? WHERE id = ?', commitment, req.user.id);
    voterGroups.join(req.user.id);
    hub.broadcast({ type: 'proposals' });
    return { user: toUser(publishUser(req.user.id), req.viewer) };
  }),
);

export default router;
