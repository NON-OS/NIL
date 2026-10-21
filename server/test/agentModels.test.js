import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import fakeAnthropic from './helpers/fakeAnthropic.js';
import until from './helpers/until.js';

// A server with an Anthropic key and no model named anywhere: built-in AI stays off, and a
// built-in agent on Anthropic needs its own model. No prices are set, so there's no cost estimate.
let srv;
let sql;
let anthropic;
const base = () => srv.base;
const owner = client(base);
const ids = {};

before(async () => {
  anthropic = await fakeAnthropic();
  srv = await startServer({ env: { ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_BASE_URL: anthropic.url } });
  sql = (await import('../db/sql.js')).default;
  (await import('../agents/runner/worker.js')).default.tick();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
});
after(() => {
  anthropic.close();
  srv.close();
});

test('built-in AI stays off without ANTHROPIC_MODEL, and says where to turn it on', async () => {
  assert.equal((await owner('GET', '/api/bootstrap')).data.ai, false);
  const t = (await owner('POST', '/api/tasks', { title: 'Plan the launch', projectId: ids.alpha })).data.task;
  const res = await owner('POST', '/api/ai/describe', { taskId: t.id });
  assert.equal(res.status, 503);
  assert.match(res.data.error, /choose an AI provider and add its key in Settings → Connect AI/);
  assert.equal(anthropic.requests.length, 0);
});

test('an agent on Anthropic needs a model when the server names none', async () => {
  const { options } = (await owner('GET', '/api/agents')).data;
  assert.deepEqual([options.anthropicAvailable, options.defaults.model, options.defaults.priceIn, options.defaults.priceOut], [true, null, null, null]);

  const refused = await owner('POST', '/api/agents', { name: 'Planner', runner: 'anthropic', access: 'write', projectIds: [ids.alpha] });
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /Give the name of the Anthropic model/);

  const made = await owner('POST', '/api/agents', { name: 'Planner', runner: 'anthropic', model: 'test-model', access: 'write', projectIds: [ids.alpha] });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  assert.equal(made.data.agent.model, 'test-model');
  assert.equal(made.data.agent.price, null);
  ids.planner = made.data.agent.id;
  // clearing the model is refused too, instead of leaving an agent that can't run
  assert.equal((await owner('PATCH', `/api/agents/${ids.planner}`, { model: '' })).status, 400);
});

test('without prices a run counts tokens and estimates no cost; with prices it does', async () => {
  anthropic.script([{ text: 'Plan: draft, review, publish.', inputTokens: 1000, outputTokens: 200 }]);
  const t = (await owner('POST', '/api/tasks', { title: 'Plan the release', projectId: ids.alpha, assigneeId: ids.planner })).data.task;
  const run = await until(() => sql.get("SELECT * FROM agent_runs WHERE task_id = ? AND status = 'done'", t.id), { what: 'the run', timeoutMs: 15000 });
  assert.equal(anthropic.requests.at(-1).body.model, 'test-model');
  assert.equal(run.cost, 0);
  let agent = (await owner('GET', '/api/agents')).data.agents.find((a) => a.id === ids.planner);
  assert.ok(agent.usage.today.input >= 1000);
  assert.equal(agent.usage.today.cost, null);
  assert.equal(agent.usage.last30Days.cost, null);

  await owner('PATCH', `/api/agents/${ids.planner}`, { priceIn: 3, priceOut: 15 });
  anthropic.script([{ text: 'Plan: draft, review, publish.', inputTokens: 1000, outputTokens: 200 }]);
  const t2 = (await owner('POST', '/api/tasks', { title: 'Plan the follow-up', projectId: ids.alpha, assigneeId: ids.planner })).data.task;
  const priced = await until(() => sql.get("SELECT * FROM agent_runs WHERE task_id = ? AND status = 'done'", t2.id), { what: 'the priced run', timeoutMs: 15000 });
  assert.ok(Math.abs(priced.cost - (1000 * 3 + 200 * 15) / 1e6) < 1e-9, String(priced.cost));
  agent = (await owner('GET', '/api/agents')).data.agents.find((a) => a.id === ids.planner);
  assert.deepEqual(agent.price, { in: 3, out: 15 });
  assert.ok(agent.usage.today.cost > 0);
});

test('an agent whose model went away fails with a comment saying what to set', async () => {
  sql.run('UPDATE agents SET model = NULL WHERE user_id = ?', ids.planner);
  const before = anthropic.requests.length;
  const t = (await owner('POST', '/api/tasks', { title: 'Plan the retro', projectId: ids.alpha, assigneeId: ids.planner })).data.task;
  const run = await until(() => sql.get("SELECT * FROM agent_runs WHERE task_id = ? AND status = 'failed'", t.id), { what: 'the failed run', timeoutMs: 15000 });
  assert.match(run.error, /no model name/);
  assert.equal(anthropic.requests.length, before);
  const comment = sql.get('SELECT body FROM comments WHERE task_id = ? AND author_id = ?', t.id, ids.planner);
  assert.match(comment.body, /Enter one in Settings → Agents, or set AGENT_MODEL/);
});
