import express from 'express';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import sessionCookie from '../auth/sessionCookie.js';
import loadTask from '../services/loadTask.js';
import planGate from '../services/planGate.js';
import aiFeatures from '../ai/aiFeatures.js';
import runAi from '../ai/runAi.js';
import creditSetting from '../aiCredits/creditSetting.js';
import checkCredit from '../aiCredits/checkCredit.js';
import creditLedger from '../aiCredits/creditLedger.js';
import aiAvailable from '../ai/provider/aiAvailable.js';

const router = express.Router();

// Every member can see a task that isn't private, so that's all an anonymous request may name.
// A private task answers like a missing one; its words never go to the AI from here.
function sharedTask(id) {
  const task = loadTask(id);
  if (!task || task.deletedAt || task.private) throw HttpError.notFound('That task');
  return task;
}

function parsePayload(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw HttpError.badRequest('That AI request wasn’t valid JSON.');
  return body;
}

// Mounted before sign-in on purpose, like anonymous ballots: the browser sends these without the
// session cookie and the server never asks who it is. The proof alone says a current member
// asked, and its nullifier spends one of that member's slots for the day.
router.post(
  '/ai-credits/:feature',
  rateLimit({ windowMs: 60_000, max: config.aiCredits.perAddressPerMinute, message: 'Too many AI requests from this address. Give it a minute.' }),
  route(async (req) => {
    // a session cookie here would tie the request to an account, so it's refused, not read
    if (sessionCookie.read(req)) throw HttpError.badRequest('An anonymous AI request must not carry a session cookie.');
    if (!aiAvailable()) throw new HttpError(503, 'AI assist is off. An admin can choose an AI provider and add its key in Settings → Connect AI.');
    const feature = Object.hasOwn(aiFeatures, req.params.feature) ? aiFeatures[req.params.feature] : null;
    if (!feature) throw HttpError.notFound('That AI feature');
    if (!creditSetting.on()) throw HttpError.forbidden('Anonymous AI requests are off in this workspace. Reload the page to send it signed in.');
    planGate('Built-in AI');
    const credit = await checkCredit(req.params.feature, req.body ?? {});
    const input = feature.input(parsePayload(req.body.payload), sharedTask);
    creditLedger.spend(credit);
    return runAi(() => feature.run(input));
  }),
);

export default router;
