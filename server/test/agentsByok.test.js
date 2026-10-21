import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import fakeAnthropic from './helpers/fakeAnthropic.js';
import fakeChatCompletions from './helpers/fakeChatCompletions.js';
import until from './helpers/until.js';

// Built-in agents with no AI key on the server: one runs on the workspace's own provider from
// Settings → Connect AI, another on an Anthropic key of its own. Each streams from the provider with the
// key it should, and no other.
const AGENT_KEY = 'sk-ant-agent-not-real-5R1t';
const WORKSPACE_KEY = 'sk-ant-workspace-not-real-8K3w';

let srv;
let sql;
let worker;
let anthropic;
let chat;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};
const FINAL = ['done', 'stopped', 'failed', 'canceled'];

const lastRun = (taskId) => sql.get('SELECT * FROM agent_runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 1', taskId);
const settled = (taskId) => until(() => FINAL.includes(lastRun(taskId)?.status) && lastRun(taskId), { what: 'the run to settle' });
const lastComment = (taskId) => sql.get('SELECT body FROM comments WHERE task_id = ? ORDER BY created_at DESC LIMIT 1', taskId)?.body;
const assign = async (title, agentId) => {
  const t = (await ana('POST', '/api/tasks', { title, projectId: ids.alpha })).data.task;
  await ana('PATCH', `/api/tasks/${t.id}`, { assigneeId: agentId });
  return t;
};

before(async () => {
  anthropic = await fakeAnthropic();
  chat = await fakeChatCompletions();
  srv = await startServer({
    env: { ANTHROPIC_API_KEY: '', ANTHROPIC_MODEL: '', AGENT_MODEL: '', AI_ANTHROPIC_URL: anthropic.url, AGENT_ALLOW_LOCAL_ENDPOINTS: 'true', AGENT_RUN_TIMEOUT_SECONDS: '5', AGENT_RETRIES: '0' },
  });
  sql = (await import('../db/sql.js')).default;
  worker = (await import('../agents/runner/worker.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallet(), 'invite', { name: 'Ana Park', inviteToken: inv.data.token });
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  worker.tick();
});
after(() => {
  anthropic.close();
  chat.close();
  srv.close();
});

test('with no key anywhere, a built-in agent needs one of its own or the workspace’s', async () => {
  const options = (await owner('GET', '/api/agents')).data.options;
  assert.equal(options.anthropicAvailable, false);
  assert.equal(options.workspaceProvider, null);
  assert.match((await owner('POST', '/api/agents', { name: 'Helper', runner: 'workspace' })).data.error, /no AI provider/);
  assert.match((await owner('POST', '/api/agents', { name: 'Claude', runner: 'anthropic', model: 'test-model' })).data.error, /Anthropic API key/);
});

test('an agent on its own Anthropic key streams with that key, which never comes back', async () => {
  const made = await owner('POST', '/api/agents', { name: 'Solo', access: 'write', projectIds: [ids.alpha], runner: 'anthropic', model: 'test-model', apiKey: AGENT_KEY });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  ids.solo = made.data.agent.id;
  assert.equal(made.data.agent.hasApiKey, true);
  assert.ok(!JSON.stringify(made.data).includes(AGENT_KEY));
  assert.ok(!JSON.stringify((await owner('GET', '/api/agents')).data).includes(AGENT_KEY));
  assert.ok(!sql.get('SELECT api_key_ct FROM agents WHERE user_id = ?', ids.solo).api_key_ct.includes(AGENT_KEY));

  anthropic.script([{ text: 'Looked at it. Nothing to change yet.' }]);
  const t = await assign('Check the release notes', ids.solo);
  const run = await settled(t.id);
  assert.equal(run.status, 'done', run.error);
  const req = anthropic.requests.at(-1);
  assert.equal(req.headers['x-api-key'], AGENT_KEY);
  assert.equal(req.headers.authorization, undefined);
  assert.equal(req.body.stream, true);
  assert.equal(req.body.model, 'test-model');
  assert.match(lastComment(t.id), /Nothing to change yet/);
});

test('an agent on the workspace’s AI follows Settings → Connect AI: Claude with the workspace key, then any OpenAI-compatible model', async () => {
  const saved = await owner('PUT', '/api/ai-provider', { kind: 'anthropic', model: 'test-model', apiKey: WORKSPACE_KEY });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const options = (await owner('GET', '/api/agents')).data.options;
  assert.equal(options.anthropicAvailable, true);
  assert.deepEqual(options.workspaceProvider, { name: 'Anthropic', kind: 'anthropic', model: 'test-model', source: 'workspace' });

  const made = await owner('POST', '/api/agents', { name: 'Helper', access: 'write', projectIds: [ids.alpha], runner: 'workspace' });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  ids.helper = made.data.agent.id;
  assert.equal(made.data.agent.model, 'test-model');

  anthropic.script([{ text: 'Read it through. All good.' }]);
  const first = await assign('Read the launch plan', ids.helper);
  assert.equal((await settled(first.id)).status, 'done');
  const req = anthropic.requests.at(-1);
  assert.equal(req.headers['x-api-key'], WORKSPACE_KEY);
  assert.equal(req.body.stream, true);

  // an agent on Anthropic with no key of its own now uses the workspace's
  const borrowed = await owner('POST', '/api/agents', { name: 'Borrower', access: 'write', projectIds: [ids.alpha], runner: 'anthropic' });
  assert.equal(borrowed.status, 200, JSON.stringify(borrowed.data));
  anthropic.script([{ text: 'Done with the workspace key.' }]);
  const second = await assign('Tidy the backlog', borrowed.data.agent.id);
  assert.equal((await settled(second.id)).status, 'done');
  assert.equal(anthropic.requests.at(-1).headers['x-api-key'], WORKSPACE_KEY);

  // the solo agent keeps its own key
  anthropic.script([{ text: 'Still on my own key.' }]);
  const third = await assign('Check the changelog', ids.solo);
  assert.equal((await settled(third.id)).status, 'done');
  assert.equal(anthropic.requests.at(-1).headers['x-api-key'], AGENT_KEY);

  // the admin moves the workspace to a model on an OpenAI-compatible server
  await owner('PUT', '/api/ai-provider', { kind: 'compatible', baseUrl: `${chat.url}/v1`, model: 'test-model-local' });
  chat.script([{ body: { choices: [{ message: { role: 'assistant', content: 'Answered by the local model.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } } }]);
  const fourth = await assign('Summarise the thread', ids.helper);
  const run = await settled(fourth.id);
  assert.equal(run.status, 'done', run.error);
  const sent = chat.requests.at(-1);
  assert.equal(sent.path, '/v1/chat/completions');
  assert.equal(sent.body.model, 'test-model-local');
  assert.equal(sent.headers.authorization, undefined);
  assert.match(lastComment(fourth.id), /local model/);
});

test('switching an agent to the workspace’s AI drops its own key', async () => {
  const res = await owner('PATCH', `/api/agents/${ids.solo}`, { runner: 'workspace' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.agent.hasApiKey, false);
  assert.equal(sql.get('SELECT api_key_ct FROM agents WHERE user_id = ?', ids.solo).api_key_ct, null);
});
