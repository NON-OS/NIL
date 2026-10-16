// The built-in agent on a real model, with realistic work: write copy into a checklisted task,
// split a task into steps, answer a question it's mentioned in, triage a bug. A small model's
// wording varies from run to run, so the checks hold the server to what it guarantees: the run
// finishes, the agent comments, no checklist item is ticked without its result in the comment,
// the footer tells the truth about the checklist, assigned work goes to In review and a mention
// leaves the status alone. Each comment is printed for a person to read.
//
//   node runnerCheck.js [--tasks launchPage,migration,cacheQuestion,loginBug] [--minutes 30]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({
  options: {
    state: { type: 'string', default: process.env.LIVE_STATE },
    tasks: { type: 'string', default: 'launchPage,migration,cacheQuestion,loginBug' },
    minutes: { type: 'string', default: '30' },
  },
});
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const t = checks('Built-in agent on the local model');
const owner = session(state.url, { cookie: state.people.owner.cookie });
const ana = session(state.url, { cookie: state.people.ana.cookie });
const helper = state.agents.helper.id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WORK = {
  launchPage: { how: 'assign', by: owner },
  migration: {
    how: 'assign',
    by: owner,
    description: 'Old uploads live in /var/data/uploads. Copy them to the new bucket, switch the upload path, and keep the old folder for a week. Split this into concrete checklist steps someone can follow, in order.',
  },
  cacheQuestion: { how: 'mention', by: ana, text: '@Helper how long does the project list stay cached in the browser after someone is removed from a project? Support needs an answer today.' },
  loginBug: { how: 'assign', by: ana },
};

for (const name of opt.tasks.split(',')) {
  const task = state.tasks[name];
  const work = WORK[name];
  const label = `${task.key} (${work.how})`;
  if (work.description) await owner('PATCH', `/api/tasks/${task.id}`, { description: work.description });
  const before = (await owner('GET', `/api/tasks/${task.id}/detail`)).data.task;
  const seen = new Set((await owner('GET', `/api/tasks/${task.id}/agent-activity`)).data.runs.map((r) => r.id));
  const started = Date.now();
  if (work.how === 'assign') await work.by('PATCH', `/api/tasks/${task.id}`, { assigneeId: helper });
  else await work.by('POST', `/api/tasks/${task.id}/comments`, { body: work.text });

  let run;
  while (Date.now() - started < Number(opt.minutes) * 60_000) {
    await sleep(3000);
    run = (await owner('GET', `/api/tasks/${task.id}/agent-activity`)).data.runs.find((r) => !seen.has(r.id));
    if (run && !['queued', 'running'].includes(run.status)) break;
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  t.ok(run && ['done', 'stopped'].includes(run.status), `${label}: the run finished (${run?.status}, ${seconds} s, ${run?.steps.filter((s) => s.kind === 'model').length} model turns, ${run?.inputTokens} in / ${run?.outputTokens} out)`, run?.error);
  if (!run) continue;

  const after = (await owner('GET', `/api/tasks/${task.id}/detail`)).data;
  const comment = after.comments.filter((c) => c.authorId === helper).at(-1)?.body ?? '';
  t.ok(comment.length > 80, `${label}: it left a comment with its work`);
  const ticked = after.task.checklist.filter((i) => i.done && !before.checklist.find((b) => b.id === i.id)?.done);
  const listed = comment.split('Checklist items done:')[1] ?? '';
  t.ok(ticked.every((i) => listed.includes(`- ${i.text}`)), `${label}: every item it ticked (${ticked.length}) is listed in its comment`, ticked.map((i) => i.text).join(', '));
  const open = after.task.checklist.filter((i) => !i.done).length;
  t.ok(open === 0 ? !/checklist items? still open/.test(comment) : comment.includes(`${open} of ${after.task.checklist.length} checklist item`), `${label}: the footer says how much of the checklist is still open (${open})`);
  if (work.how === 'assign' && run.status === 'done') t.ok(after.task.status === 'in_review', `${label}: finished assigned work is In review`, after.task.status);
  if (work.how === 'mention') t.ok(after.task.status === before.status, `${label}: a mention leaves the status alone`, after.task.status);
  const refused = run.steps.filter((s) => s.kind === 'guard').map((s) => s.output);
  t.note(`${label} tools: ${run.steps.filter((s) => s.kind === 'tool' || s.kind === 'refused').map((s) => s.tool).join(', ') || 'none'}`);
  if (refused.length) t.note(`${label} refused: ${refused.join(' | ')}`);
  t.note(`${label} checklist: ${after.task.checklist.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('; ') || 'empty'}`);
  t.note(`${label} comment:\n${comment.replace(/^/gm, '        ')}`);
}
t.done();
