import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import scriptedModel from './helpers/scriptedModel.js';
import fakeChatCompletions from './helpers/fakeChatCompletions.js';
import until from './helpers/until.js';

// What keeps a built-in agent honest and running: a checklist item is ticked only with the work
// for it, a reply can't claim ticks it didn't make, an unexpected error ends the run cleanly,
// and a model server that refuses max_tokens gets the request again without it.
let srv;
let sql;
let providerFor;
let chat;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};
const FINAL = ['done', 'stopped', 'failed', 'canceled'];

const runsOf = (taskId) => sql.all('SELECT * FROM agent_runs WHERE task_id = ? ORDER BY created_at', taskId);
const settled = (taskId) => until(() => runsOf(taskId).length && FINAL.includes(runsOf(taskId).at(-1).status) && runsOf(taskId).at(-1), { what: 'the run to settle' });
const steps = (runId) => sql.all('SELECT * FROM agent_steps WHERE run_id = ? ORDER BY seq', runId);
const comments = (taskId) => sql.all('SELECT c.*, u.name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at', taskId);
const task = (id) => sql.get('SELECT * FROM tasks WHERE id = ?', id);
const key = (t) => `NON-${t.number}`;
const use = (turns) => {
  const model = scriptedModel(turns);
  providerFor.replace(model.factory);
  return model;
};
const newTask = async (body) => (await ana('POST', '/api/tasks', { projectId: ids.alpha, ...body })).data.task;

before(async () => {
  chat = await fakeChatCompletions();
  srv = await startServer({ env: { AGENT_ALLOW_LOCAL_ENDPOINTS: 'true', AGENT_RUN_TIMEOUT_SECONDS: '5' } });
  sql = (await import('../db/sql.js')).default;
  providerFor = (await import('../agents/runner/providerFor.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallet(), 'invite', { name: 'Ana Park', inviteToken: inv.data.token });
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  const made = await owner('POST', '/api/agents', { name: 'Builder', access: 'write', projectIds: [ids.alpha], runner: 'openai', endpoint: `${chat.url}/v1`, model: 'test-model' });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  ids.builder = made.data.agent.id;
  (await import('../agents/runner/worker.js')).default.tick();
});
after(() => {
  providerFor.replace(null);
  chat.close();
  srv.close();
});

test('a checklist item is ticked only with the work for it; the run log says what was refused', async () => {
  const model = use([
    (state) => ({ calls: [{ name: 'update_task', input: { key: state.user.match(/<task key="([^"]+)"/)[1], checklistTick: [state.user.match(/\(id ([\w-]+)\) Headline/)[1]] } }] }),
    (state) => {
      const key_ = state.user.match(/<task key="([^"]+)"/)[1];
      const id = (text) => state.user.match(new RegExp(`\\(id ([\\w-]+)\\) ${text}`))[1];
      return {
        calls: [{
          name: 'update_task',
          input: {
            key: key_,
            checklistAdd: ['Ask Ana to review the copy'],
            checklistDone: [
              { id: id('Three feature blurbs'), result: 'Completed the three feature blurbs as requested.' },
              { id: id('Call to action'), result: 'Start a free workspace today. No email, no card.' },
            ],
          },
        }],
      };
    },
    { text: 'Headline: Plan your week in one private place. Call to action: start a free workspace today, no email, no card. The blurbs still need writing.' },
  ]);
  const t = await newTask({ title: 'Write the launch page copy', checklist: [{ text: 'Headline' }, { text: 'Three feature blurbs' }, { text: 'Call to action' }], assigneeId: ids.builder });
  const run = await settled(t.id);
  assert.equal(run.status, 'done', run.error);
  assert.deepEqual(JSON.parse(task(t.id).checklist).map((i) => [i.text, i.done]), [['Headline', false], ['Three feature blurbs', false], ['Call to action', true], ['Ask Ana to review the copy', false]]);

  const guards = steps(run.id).filter((s) => s.kind === 'guard').map((s) => s.output);
  assert.equal(guards.length, 2);
  assert.match(guards[0], /^Didn’t tick “Headline”: it was ticked without a result/);
  assert.match(guards[1], /^Didn’t tick “Three feature blurbs”: the result only says it’s done/);
  // the model is told, so it can do the work or leave the item open
  const [first, second] = model.seen.at(-1).results;
  assert.equal(first.isError, true);
  assert.match(first.content, /Not ticked: “Headline”/);
  assert.match(second.content, /"changed":true/);
  assert.match(second.content, /Not ticked: “Three feature blurbs”/);

  const note = comments(t.id).at(-1).body;
  assert.match(note, /^Headline: Plan your week/);
  // the call to action is already in the reply, so the list only names the item
  assert.match(note, /Checklist items done:\n- Call to action\n/);
  assert.doesNotMatch(note, /- Three feature blurbs:/);
  // whatever the reply says, the footer tells how much of the checklist is still open
  assert.match(note, /3 of 4 checklist items still open/);
});

test('a result has to be work, not a claim of work', async () => {
  const { default: checkWorkProduct } = await import('../agents/runner/checkWorkProduct.js');
  for (const [result, item] of [['Done', 'Headline'], ['Headline done.', 'Headline'], ['Completed the three feature blurbs as requested', 'Three feature blurbs'], ['Checked and verified, all ok', 'Check the release notes'], ['I have done this step now', 'Reproduce']]) {
    assert.ok(checkWorkProduct(result, item), `${result} should not pass`);
  }
  for (const [result, item] of [['Plan your week in one private place', 'Headline'], ['Added four steps: reproduce, find the cause, fix, retest', 'Split the work into steps'], ['Tokens expire after 24 hours; the app never renews them', 'Reproduce']]) {
    assert.equal(checkWorkProduct(result, item), null, result);
  }
});

test('an unexpected error inside a run ends it with a comment and a log line, not a crash', async () => {
  use([() => {
    throw new TypeError('something nobody expected');
  }]);
  const t = await newTask({ title: 'Tidy the release notes', assigneeId: ids.builder });
  const run = await settled(t.id);
  assert.equal(run.status, 'failed');
  assert.equal(run.error, 'The agent stopped on an unexpected error.');
  assert.match(comments(t.id).at(-1).body, /^I couldn’t finish this: The agent stopped on an unexpected error\./);
  assert.ok(steps(run.id).some((s) => s.kind === 'error' && s.output === 'The agent stopped on an unexpected error.'));
});

test('an OpenAI-compatible server that refuses max_tokens gets the request again without it', async () => {
  providerFor.replace(null);
  const local = ids.builder;
  const t = await newTask({ title: 'Draft the incident timeline' });
  const before = chat.requests.length;
  chat.script([
    { status: 400, body: { error: { message: "This model's maximum context length is 8192 tokens. However, you requested 32300 tokens. Please reduce max_tokens." } } },
    { body: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_task', arguments: JSON.stringify({ key: key(t) }) } }] }, finish_reason: 'tool_calls' }] } },
    { body: { choices: [{ message: { role: 'assistant', content: 'Timeline: 09:12 alert, 09:20 rollback, 09:31 resolved.' }, finish_reason: 'stop' }] } },
  ]);
  await ana('PATCH', `/api/tasks/${t.id}`, { assigneeId: local });
  const run = await settled(t.id);
  assert.equal(run.status, 'done', run.error);
  const sent = chat.requests.slice(before);
  assert.equal(sent.length, 3);
  assert.equal(sent[0].body.max_tokens, 32000, 'AGENT_MAX_OUTPUT_TOKENS by default');
  assert.ok(sent.slice(1).every((r) => !('max_tokens' in r.body)));
  assert.match(comments(t.id).at(-1).body, /^Timeline:/);
});
