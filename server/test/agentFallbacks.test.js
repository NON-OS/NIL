import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import fakeAnthropic from './helpers/fakeAnthropic.js';
import until from './helpers/until.js';

// AGENT_FALLBACKS=default asks Anthropic to re-run a declined request on another model. Some
// models and accounts refuse the setting; the run then goes on without it.
let srv;
let sql;
let anthropic;
const base = () => srv.base;
const owner = client(base);
const ids = {};
const FINAL = ['done', 'stopped', 'failed', 'canceled'];
const settled = (taskId) => until(() => sql.get('SELECT * FROM agent_runs WHERE task_id = ? AND status IN (?, ?, ?, ?)', taskId, ...FINAL), { what: 'the run', timeoutMs: 15000 });
const assign = async (title) => (await owner('POST', '/api/tasks', { title, projectId: ids.alpha, assigneeId: ids.agent })).data.task;

before(async () => {
  anthropic = await fakeAnthropic();
  srv = await startServer({ env: { ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_BASE_URL: anthropic.url, AGENT_MODEL: 'test-model', AGENT_FALLBACKS: 'default' } });
  sql = (await import('../db/sql.js')).default;
  (await import('../agents/runner/worker.js')).default.tick();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  ids.agent = (await owner('POST', '/api/agents', { name: 'Planner', runner: 'anthropic', access: 'write', projectIds: [ids.alpha] })).data.agent.id;
});
after(() => {
  anthropic.close();
  srv.close();
});

test('with AGENT_FALLBACKS=default every request asks for server-side fallbacks', async () => {
  anthropic.script([{ text: 'Plan: draft, review, publish.' }]);
  const run = await settled((await assign('Plan the launch')).id);
  assert.equal(run.status, 'done', run.error);
  const sent = anthropic.requests.at(-1);
  assert.equal(sent.body.fallbacks, 'default');
  assert.match(sent.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
});

test('a model that refuses fallbacks gets the request again without them, for the rest of the run', async () => {
  const before = anthropic.requests.length;
  const t = await assign('Plan the retro');
  anthropic.script([
    { error: { status: 400, message: 'fallbacks: this model does not support server-side fallbacks' } },
    { tool: { id: 'toolu_1', name: 'whoami', input: {} } },
    { text: 'Plan: collect notes, hold the retro, share actions.' },
  ]);
  const run = await settled(t.id);
  assert.equal(run.status, 'done', run.error);
  const sent = anthropic.requests.slice(before);
  assert.equal(sent.length, 3);
  assert.equal(sent[0].body.fallbacks, 'default');
  for (const later of sent.slice(1)) {
    assert.equal(later.body.fallbacks, undefined);
    assert.doesNotMatch(later.headers['anthropic-beta'] ?? '', /server-side-fallback/);
  }
  assert.match(sql.get('SELECT body FROM comments WHERE task_id = ? ORDER BY created_at DESC', t.id).body, /collect notes/);
});

test('any other 400 still fails the run, without a second request', async () => {
  const before = anthropic.requests.length;
  const t = await assign('Plan the offsite');
  anthropic.script([{ error: { status: 400, message: 'max_tokens: 32000 > 16000, the maximum for this model' } }]);
  const run = await settled(t.id);
  assert.equal(run.status, 'failed');
  assert.equal(anthropic.requests.length - before, 1);
});
