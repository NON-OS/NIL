import check from '../lib/check.js';
import calendar from '../lib/calendar.js';
import HttpError from '../lib/HttpError.js';
import breakdownTask from './breakdownTask.js';
import describeTask from './describeTask.js';
import extractTasks from './extractTasks.js';
import weeklyBrief from './weeklyBrief.js';
import deckNarrative from './deckNarrative.js';
import draftDoc from './draftDoc.js';

const todayFrom = (body) => check.date(body.today, 'Today') ?? calendar.today();

function taskInput(body, openTask) {
  const task = openTask(String(body.taskId || ''));
  if (task.sealed) throw HttpError.badRequest('This task is encrypted, so the AI can’t read it.');
  return task;
}

// The built-in AI features, signed in or anonymous alike. `input` checks a request and gathers
// what the feature needs without calling the provider, so a bad request costs nothing; `run`
// makes the one call. `openTask` decides which tasks the caller may use.
const aiFeatures = {
  breakdown: { input: taskInput, run: async (task) => ({ steps: await breakdownTask(task) }) },
  describe: { input: taskInput, run: async (task) => ({ description: await describeTask(task) }) },
  extract: {
    input: (body) => ({ notes: check.text(body.text, 'Notes', { min: 1, max: 40_000 }), today: todayFrom(body) }),
    run: async ({ notes, today }) => ({ tasks: await extractTasks(notes, today) }),
  },
  // The browser sends only the facts it put on the slides (no private tasks unless the person
  // chose to include them), capped so a deck can't become a bulk export.
  deck: {
    input(body) {
      const facts = body.facts;
      if (!facts || typeof facts !== 'object' || JSON.stringify(facts).length > 30_000) throw HttpError.badRequest('Those deck facts are missing or too large.');
      return facts;
    },
    run: async (facts) => ({ narrative: await deckNarrative(facts) }),
  },
  draft: {
    input: (body) => ({
      instruction: check.text(body.instruction, 'Instruction', { min: 1, max: 4000 }),
      title: check.text(body.title, 'Title', { max: 200 }),
      context: check.text(body.context, 'Doc text', { max: 40_000 }),
    }),
    run: async (doc) => ({ text: await draftDoc(doc) }),
  },
  brief: { input: todayFrom, run: async (today) => ({ text: await weeklyBrief(today) }) },
};

export default aiFeatures;
