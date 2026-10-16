// The webhook-driven outside agent, end to end: a signed test ping, then a person assigns it a
// bug and mentions it on a question, and the agent service (local model + REST API) does the
// work. Needs agentService/server.js running and the local model up.
//
//   node serviceCheck.js [--service http://127.0.0.1:4700]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({
  options: {
    state: { type: 'string', default: process.env.LIVE_STATE },
    service: { type: 'string', default: 'http://127.0.0.1:4700' },
    minutes: { type: 'string', default: '20' },
  },
});
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const owner = session(state.url, { cookie: state.people.owner.cookie });
const ana = session(state.url, { cookie: state.people.ana.cookie });
const t = checks('Webhook-driven agent service');
const scout = state.agents.scout;
const get = async (path) => (await fetch(`${opt.service}${path}`)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, fn, ms = Number(opt.minutes) * 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(2000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const ping = await owner('POST', `/api/agents/${scout.id}/webhook/test`);
t.ok(ping.status === 200 && ping.data.delivery?.status === 'delivered', 'Send a test: the ping is delivered', JSON.stringify(ping.data.delivery ?? ping.data));
const log1 = await get('/log');
const got = log1.find((e) => e.event === 'ping');
t.ok(got?.valid === true, 'the service verified the ping signature');
t.ok(/^t=\d+,v1=[0-9a-f]{64}$/.test(got?.signature ?? '') && got.signature.startsWith(`t=${got.timestamp},`), 'Nil-Signature is t=<Nil-Timestamp>,v1=<hex>', got?.signature);
t.ok(got?.delivery === got?.body?.id, 'Nil-Delivery matches the payload id');

const bug = state.tasks.loginBug;
await ana('PATCH', `/api/tasks/${bug.id}`, { assigneeId: scout.id });
const assigned = await until('task.assigned delivery', async () => (await get('/log')).find((e) => e.event === 'task.assigned'));
t.ok(assigned.valid, 'task.assigned arrives signed');
t.ok(assigned.body.data.task.key === bug.key && !JSON.stringify(assigned.body).includes('Safari'), 'the payload has the task key and no task text', JSON.stringify(assigned.body.data));
t.ok(assigned.body.data.actor?.kind === 'person' && assigned.body.data.actor.name === 'Ana Park', 'actor is the person who assigned it');

const q = state.tasks.cacheQuestion;
await ana('POST', `/api/tasks/${q.id}/comments`, { body: '@Scout do you know how long the project list stays cached in the browser? Support needs an answer today.' });
const mention = await until('comment.created delivery', async () => (await get('/log')).find((e) => e.event === 'comment.created' && e.body?.data?.task?.key === q.key));
t.ok(mention.valid && mention.body.data.mentioned === true && mention.body.data.comment?.id, 'comment.created arrives with mentioned: true and a comment id');

t.note(`waiting for the local model to work both tasks (up to ${opt.minutes} min)...`);
const work = await until('both pieces of work', async () => {
  const w = await get('/work');
  return w.done.filter((d) => ['task.assigned', 'comment.created'].includes(d.type)).length >= 2 && !w.busy ? w : null;
});
for (const d of work.done) t.note(`${d.type} ${d.key ?? ''}: ${d.error ?? JSON.stringify(d.calls ?? d.skipped)} (${d.turns?.length ?? 0} model turns, ${((d.turns ?? []).reduce((s, x) => s + x.ms, 0) / 1000).toFixed(0)} s)`);

const detail = (await owner('GET', `/api/tasks/${bug.id}/detail`)).data;
const bugComments = detail.comments?.filter((c) => c.authorId === scout.id) ?? [];
t.ok(bugComments.length === 1 && bugComments[0].body.length > 40, 'the agent left one useful comment on the bug', bugComments[0]?.body);
const bugTask = (await owner('GET', `/api/tasks/${bug.id}/detail`)).data.task ?? detail.task;
t.ok(bugTask?.status === 'in_review', 'the bug moved to In review', bugTask?.status);

const qDetail = (await owner('GET', `/api/tasks/${q.id}/detail`)).data;
const answer = qDetail.comments?.filter((c) => c.authorId === scout.id) ?? [];
t.ok(answer.length === 1, 'the agent answered the question in a comment', answer[0]?.body);

const hist = (await owner('GET', `/api/agents/${scout.id}/audit`)).data.entries ?? [];
t.ok(hist.some((e) => e.action === 'add_comment' && e.via === 'rest'), 'its REST calls are in the audit trail');
t.done();
