import express from 'express';
import route from '../lib/route.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import visibleTask from '../services/visibleTask.js';
import aiFeatures from '../ai/aiFeatures.js';
import runAi from '../ai/runAi.js';
import creditSetting from '../aiCredits/creditSetting.js';

const router = express.Router();
const DAY = 86_400_000;

router.use('/ai', (req, res, next) => {
  if (!config.ai.enabled) return res.status(503).json({ error: 'AI assist is off. An admin can turn it on by setting ANTHROPIC_API_KEY and ANTHROPIC_MODEL on the server.' });
  next();
});

// Signed-in requests are the fallback for people without a voting key. Someone who has one sends
// anonymously while the workspace has that on, so their day can't hold both allowances.
router.use('/ai', (req, res, next) => {
  if (req.user.semaphoreCommitment && req.user.role !== 'guest' && creditSetting.on()) {
    return res.status(409).json({ error: 'This workspace sends your AI requests anonymously. Reload the page and try again.' });
  }
  next();
});

router.use('/ai', rateLimit({ windowMs: 60_000, max: config.ai.perMinute, key: (req) => `ai:${req.user.id}`, message: 'That’s a lot of AI requests. Give it a minute.' }));
router.use('/ai', rateLimit({ windowMs: DAY, max: config.ai.perDay, key: (req) => `ai-day:${req.user.id}`, message: 'You’ve used today’s AI requests. They renew tomorrow.' }));

for (const [name, feature] of Object.entries(aiFeatures)) {
  router.post(
    `/ai/${name}`,
    route(async (req) => {
      const input = feature.input(req.body ?? {}, (id) => visibleTask(id, req.user));
      return runAi(() => feature.run(input));
    }),
  );
}

export default router;
