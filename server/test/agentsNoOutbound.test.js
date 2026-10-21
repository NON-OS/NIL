import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
const owner = client(() => srv.base);

// a hosted workspace: no route out, so nothing that would have to reach one
before(async () => {
  srv = await startServer({ env: { AGENT_OUTBOUND: 'off' } });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
});
after(() => srv.close());

test('a server with no route out offers external agents only, and no webhooks', async () => {
  const options = (await owner('GET', '/api/agents')).data.options;
  assert.equal(options.outbound, false);

  const local = await owner('POST', '/api/agents', { name: 'Local', runner: 'openai', endpoint: 'https://models.example.com/v1', model: 'llama' });
  assert.equal(local.status, 400);
  assert.match(local.data.error, /no route out/);

  const external = await owner('POST', '/api/agents', { name: 'Scout', access: 'read', runner: 'external' });
  assert.equal(external.status, 200, JSON.stringify(external.data));
  const hook = await owner('PUT', `/api/agents/${external.data.agent.id}/webhook`, { url: 'https://agent.example.com/hook', events: ['task.assigned'] });
  assert.equal(hook.status, 400);
  assert.match(hook.data.error, /can’t send webhooks/);
});

test('a provider saved with no route out keeps built-in AI off until the server has one', async () => {
  const saved = await owner('PUT', '/api/ai-provider', { kind: 'anthropic', model: 'test-model', apiKey: 'sk-ant-not-real-0000' });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.outbound, false);
  const boot = (await owner('GET', '/api/bootstrap')).data;
  assert.equal(boot.ai, false);
  assert.equal(boot.aiProvider, null);
  const tested = (await owner('POST', '/api/ai-provider/test', { kind: 'anthropic', model: 'test-model' })).data;
  assert.equal(tested.ok, false);
  assert.match(tested.error, /no route out/);

  assert.match((await owner('POST', '/api/agents', { name: 'Helper', runner: 'workspace' })).data.error, /no AI provider/);
  assert.match((await owner('POST', '/api/agents', { name: 'Claude', runner: 'anthropic', model: 'test-model', apiKey: 'sk-ant-not-real-1111' })).data.error, /no route out/);
  await owner('DELETE', '/api/ai-provider');
});
