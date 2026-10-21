import express from 'express';
import route from '../lib/route.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import visibleTask from '../services/visibleTask.js';
import aiFeatures from '../ai/aiFeatures.js';
import runAi from '../ai/runAi.js';
import mustProve from '../aiCredits/mustProve.js';
import signedAllowance from '../ai/signedAllowance.js';
import aiAvailable from '../ai/provider/aiAvailable.js';

const router = express.Router();

router.use('/ai', (req, res, next) => {
  if (!aiAvailable()) return res.status(503).json({ error: 'AI assist is off. An admin can choose an AI provider and add its key in Settings → Connect AI.' });
  next();
});

// Signed-in requests are the fallback for people who can't prove membership right now. Someone
// whose voting key is in the group sends anonymously while the workspace has that on, so their
// day can't hold both allowances.
router.use('/ai', (req, res, next) => {
  if (mustProve(req.user.id)) {
    return res.status(409).json({ error: 'This workspace sends your AI requests anonymously. Reload the page and try again.' });
  }
  next();
});

router.use('/ai', rateLimit({ windowMs: 60_000, max: config.ai.perMinute, key: (req) => `ai:${req.user.id}`, message: 'That’s a lot of AI requests. Give it a minute.' }));

for (const [name, feature] of Object.entries(aiFeatures)) {
  router.post(
    `/ai/${name}`,
    route(async (req) => {
      const input = feature.input(req.body ?? {}, (id) => visibleTask(id, req.user));
      signedAllowance.spend(req.user.id);
      return runAi(() => feature.run(input));
    }),
  );
}

export default router;
