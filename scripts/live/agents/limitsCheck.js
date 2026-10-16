// The built-in runner's limits on the local model: one step, a tiny token budget, cancelling a
// run, and a model server that can't be reached (retried with a delay, then cancelled).
//
//   node limitsCheck.js
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({ options: { state: { type: 'string', default: process.env.LIVE_STATE } } });
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const t = checks('Runner limits');
const owner = session(state.url, { cookie: state.people.owner.cookie });
const helper = state.agents.helper.id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const activity = async (task) => (await owner('GET', `/api/tasks/${task.id}/agent-activity`)).data.runs;
async function settle(task, minutes = 15, accept = (r) => !['queued', 'running'].includes(r.status)) {
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    const run = (await activity(task))[0];
    if (run && accept(run)) return run;
    await sleep(2000);
  }
  throw new Error('timed out');
}
const assign = async (title, extra = {}) => {
  const task = (await owner('POST', '/api/tasks', { title, projectId: state.projects.website, ...extra })).data.task;
  await owner('PATCH', `/api/tasks/${task.id}`, { assigneeId: helper });
  return task;
};
const lastComment = async (task) => (await owner('GET', `/api/tasks/${task.id}/detail`)).data.comments.filter((c) => c.authorId === helper).at(-1)?.body ?? '';

// one step: a model turn that calls a tool ends the run there
await owner('PATCH', `/api/agents/${helper}`, { maxSteps: 1 });
const oneStep = await assign('List three risks for the launch', { description: 'Read the related tasks first, then list three risks.' });
const stepped = await settle(oneStep);
t.ok(['stopped', 'done'].includes(stepped.status), `with 1 step the run ends after one model turn (${stepped.status}, ${stepped.error ?? 'no error'})`);
t.ok(stepped.steps.filter((s) => s.kind === 'model').length === 1, 'exactly one model turn');
if (stepped.status === 'stopped') t.ok(/step limit \(1\)/.test(await lastComment(oneStep)), 'the comment says it stopped at the step limit');

// tokens per run: the first turn already goes over a 1,000-token budget
await owner('PATCH', `/api/agents/${helper}`, { maxSteps: null, maxRunTokens: 1000 });
const tokens = await assign('Summarise the open website tasks', { description: 'Look at the open tasks in Website and summarise them in three lines.' });
const budget = await settle(tokens);
t.ok(budget.inputTokens > 1000, `the first turn used ${budget.inputTokens} input tokens`);
t.ok(budget.status === 'done' || (budget.status === 'stopped' && budget.error === 'run_tokens'), `the run stops on the token limit or finishes in that turn (${budget.status}, ${budget.error})`);
if (budget.status === 'stopped') t.ok(/token limit for one run/.test(await lastComment(tokens)), 'the comment says why');
await owner('PATCH', `/api/agents/${helper}`, { maxRunTokens: null });

// cancelling a run that's working
const long = await assign('Draft a FAQ with ten questions and answers');
const running = await settle(long, 5, (r) => r.status === 'running');
const cancel = await owner('POST', `/api/agent-runs/${running.id}/cancel`);
t.ok(cancel.status === 200, 'an admin can stop a running run');
const cancelled = await settle(long, 5);
t.ok(cancelled.status === 'canceled' && /Cancelled by Erik Lind/.test(cancelled.error ?? ''), 'it ends as cancelled, saying who stopped it', cancelled.error);
t.ok((await owner('POST', `/api/agent-runs/${running.id}/cancel`)).status === 409, 'a finished run can’t be cancelled again');

// a model server that doesn't answer: a transient error, queued again with a delay
const endpoint = (await owner('GET', '/api/agents')).data.agents.find((a) => a.id === helper).endpoint;
await owner('PATCH', `/api/agents/${helper}`, { endpoint: 'http://127.0.0.1:9/v1' });
const dead = await assign('Write the release notes');
const retrying = await settle(dead, 3, (r) => r.status === 'queued' && r.attempts >= 1 && r.error);
t.ok(/ECONNREFUSED|refused|network/i.test(retrying.error), `an unreachable model server puts the run back in the queue (${retrying.error})`);
const steps = (await activity(dead))[0].steps;
t.ok(steps.some((s) => s.kind === 'error' && /Trying again in \d+ s/.test(s.output ?? '')), 'the run log says when it tries again', steps.map((s) => s.output).join(' | ').slice(0, 200));
await owner('POST', `/api/agent-runs/${retrying.id}/cancel`);
t.ok((await settle(dead, 2)).status === 'canceled', 'a queued retry can be cancelled');
await owner('PATCH', `/api/agents/${helper}`, { endpoint });
t.done();
