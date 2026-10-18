import express from 'express';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import requireMember from '../auth/requireMember.js';
import hub from '../realtime/hub.js';
import creditSetting from '../aiCredits/creditSetting.js';
import creditGroup from '../aiCredits/creditGroup.js';
import creditLedger from '../aiCredits/creditLedger.js';
import utcDay from '../aiCredits/utcDay.js';

const router = express.Router();

// What a member's browser needs to send AI requests anonymously: the member list it proves
// against, how many slots a day holds, and today's spent nullifiers, so it can find a slot it
// hasn't used. The same answer for every member; the browser works out its own scopes.
router.get(
  '/ai-credits',
  requireMember,
  route(() => {
    const { members, root } = creditGroup.current();
    return { on: config.ai.enabled && creditSetting.on(), day: utcDay(), slots: config.ai.perDay, depth: config.semaphore.depth, members, root, spent: creditLedger.spentToday() };
  }),
);

// Admins see anonymous use only as a count per day.
router.get(
  '/ai-credits/usage',
  requireAdmin,
  route(() => {
    creditLedger.prune();
    return { on: creditSetting.on(), days: creditLedger.totals() };
  }),
);

router.put(
  '/ai-credits',
  requireAdmin,
  route((req) => {
    if (typeof req.body?.anonymous !== 'boolean') throw HttpError.badRequest('Anonymous AI requests are either on or off.');
    creditSetting.set(req.body.anonymous);
    hub.broadcast({ type: 'ai-credits', on: req.body.anonymous });
    return { on: creditSetting.on() };
  }),
);

export default router;
