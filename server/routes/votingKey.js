import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import publishUser from '../services/publishUser.js';
import voterGroups from '../votes/voterGroups.js';
import canonical from '../votes/canonical.js';
import toUser from '../mappers/toUser.js';

const router = express.Router();

// Your Semaphore identity commitment: the public half of your anonymous voting key. It joins
// you to every open anonymous vote, and to new ones as they start.
router.put(
  '/me/semaphore',
  route((req) => {
    // one spelling per key, or "0" + someone's key would be a second seat in every census
    const commitment = canonical.number(req.body?.commitment);
    if (!commitment || commitment === '0') throw HttpError.badRequest('That isn’t a voting key.');
    const current = sql.get('SELECT semaphore_commitment AS c FROM users WHERE id = ?', req.user.id).c;
    if (current === commitment) {
      sql.run('UPDATE users SET semaphore_pending = NULL WHERE id = ?', req.user.id);
      return { user: toUser(publishUser(req.user.id), req.viewer) };
    }
    // a new key mid-vote would be a second identity, and a second ballot. Noted, so this person's
    // AI requests go signed in until it can be registered: they can't prove membership meanwhile
    if (current && voterGroups.inOpenVote(current)) {
      sql.run('UPDATE users SET semaphore_pending = ? WHERE id = ?', commitment, req.user.id);
      throw new HttpError(409, 'You can switch voting keys once the open anonymous votes close.');
    }
    if (sql.get('SELECT 1 FROM users WHERE semaphore_commitment = ? AND id != ?', commitment, req.user.id)) throw new HttpError(409, 'That voting key belongs to someone else.');
    sql.run('UPDATE users SET semaphore_commitment = ?, semaphore_pending = NULL WHERE id = ?', commitment, req.user.id);
    voterGroups.join(req.user.id);
    hub.broadcast({ type: 'proposals' });
    return { user: toUser(publishUser(req.user.id), req.viewer) };
  }),
);

export default router;
