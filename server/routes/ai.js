import express from 'express';
import route from '../lib/route.js';
import check from '../lib/check.js';
import config from '../config.js';
import calendar from '../lib/calendar.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import visibleTask from '../services/visibleTask.js';
import friendlyError from '../ai/friendlyError.js';
import breakdownTask from '../ai/breakdownTask.js';
import describeTask from '../ai/describeTask.js';
import extractTasks from '../ai/extractTasks.js';
import weeklyBrief from '../ai/weeklyBrief.js';
import deckNarrative from '../ai/deckNarrative.js';
import draftDoc from '../ai/draftDoc.js';

const router = express.Router();

router.use('/ai', (req, res, next) => {
  if (!config.ai.enabled) return res.status(503).json({ error: 'AI assist is off. An admin can turn it on by setting ANTHROPIC_API_KEY on the server.' });
  next();
});
router.use('/ai', rateLimit({ windowMs: 60_000, max: 12, key: (req) => `ai:${req.user.id}`, message: 'That’s a lot of AI requests. Give it a minute.' }));

function ai(handler) {
  return route(async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const { status, message } = friendlyError(err);
      if (status >= 500 && !err.userMessage) console.error('[ai]', err.message);
      throw new HttpError(status, message);
    }
  });
}

function taskFrom(req) {
  const task = visibleTask(String(req.body.taskId || ''), req.user);
  return task;
}

const todayFrom = (req) => check.date(req.body.today, 'Today') ?? calendar.today();

router.post('/ai/breakdown', ai(async (req) => ({ steps: await breakdownTask(taskFrom(req)) })));

router.post('/ai/describe', ai(async (req) => ({ description: await describeTask(taskFrom(req)) })));

router.post(
  '/ai/extract',
  ai(async (req) => {
    const notes = check.text(req.body.text, 'Notes', { min: 1, max: 40_000 });
    return { tasks: await extractTasks(notes, todayFrom(req)) };
  }),
);

// The browser sends only the facts it put on the slides (no private tasks unless the person
// chose to include them), capped so a deck can't become a bulk export.
router.post(
  '/ai/deck',
  ai(async (req) => {
    const facts = req.body?.facts;
    if (!facts || typeof facts !== 'object' || JSON.stringify(facts).length > 30_000) throw HttpError.badRequest('Those deck facts are missing or too large.');
    return { narrative: await deckNarrative(facts) };
  }),
);

router.post(
  '/ai/draft',
  ai(async (req) => ({
    text: await draftDoc({
      instruction: check.text(req.body?.instruction, 'Instruction', { min: 1, max: 4000 }),
      title: check.text(req.body?.title, 'Title', { max: 200 }),
      context: check.text(req.body?.context, 'Doc text', { max: 40_000 }),
    }),
  })),
);

router.post('/ai/brief', ai(async (req) => ({ text: await weeklyBrief(todayFrom(req)) })));

export default router;
