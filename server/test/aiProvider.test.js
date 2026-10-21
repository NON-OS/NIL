import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import fakeMessages from './helpers/fakeMessages.js';
import fakeChatCompletions from './helpers/fakeChatCompletions.js';
import aiAnswer from './helpers/aiAnswer.js';

// Each workspace brings its own AI provider and key. The server here has no AI key of its own, so
// everything built-in AI does runs on what an admin saved in Settings → Connect AI, and the key never
// comes back out: not to the browser, not to the logs, not in the clear on disk.
const ANTHROPIC_KEY = 'sk-ant-workspace-not-real-7Q2x';
const OPENAI_KEY = 'sk-openai-workspace-not-real-9L4m';
const COMPATIBLE_KEY = 'compat-key-not-real-3Z8p';
const SECRETS = [ANTHROPIC_KEY, OPENAI_KEY, COMPATIBLE_KEY];

let srv;
let claude;
let openai;
let compatible;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};
const logged = [];
const writes = { out: process.stdout.write, err: process.stderr.write };

const promptOf = (body) => body.messages?.findLast?.((m) => m.role === 'user')?.content ?? '';
const save = (body) => owner('PUT', '/api/ai-provider', body);
const features = (taskId) => [
  ['describe', { taskId }],
  ['breakdown', { taskId }],
  ['extract', { text: 'Ana books the venue by Friday.' }],
  ['draft', { instruction: 'Three ideas for the launch post', title: '', context: '' }],
  ['deck', { facts: { project: 'Launch', shipped: ['NON-1'] } }],
  ['brief', {}],
];

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

before(async () => {
  // the server runs in this process, so its log lines pass through here on their way out
  process.stdout.write = (chunk, ...rest) => (logged.push(String(chunk)), writes.out.call(process.stdout, chunk, ...rest));
  process.stderr.write = (chunk, ...rest) => (logged.push(String(chunk)), writes.err.call(process.stderr, chunk, ...rest));
  claude = await fakeMessages({ reply: (body) => aiAnswer(promptOf(body)) });
  openai = await fakeChatCompletions({ answer: (body) => aiAnswer(promptOf(body)) });
  compatible = await fakeChatCompletions({ answer: (body) => aiAnswer(promptOf(body)) });
  srv = await startServer({
    env: { ANTHROPIC_API_KEY: '', ANTHROPIC_MODEL: '', AI_ANTHROPIC_URL: claude.url, AI_OPENAI_URL: `${openai.url}/v1`, AGENT_ALLOW_LOCAL_ENDPOINTS: 'true', AI_REQUESTS_PER_MINUTE: '200', AI_REQUESTS_PER_DAY: '200' },
  });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallet(), 'invite', { name: 'Ana Park', inviteToken: inv.data.token });
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  ids.task = (await ana('POST', '/api/tasks', { title: 'Plan the launch', projectId: ids.alpha })).data.task.id;
});
after(() => {
  process.stdout.write = writes.out;
  process.stderr.write = writes.err;
  claude.close();
  openai.close();
  compatible.close();
  srv.close();
});

test('with no provider and no server key, built-in AI is off and says where to turn it on', async () => {
  const boot = (await ana('GET', '/api/bootstrap')).data;
  assert.equal(boot.ai, false);
  assert.equal(boot.aiProvider, null);
  const res = await ana('POST', '/api/ai/describe', { taskId: ids.task });
  assert.equal(res.status, 503);
  assert.match(res.data.error, /Settings → Connect AI/);
  assert.deepEqual((await owner('GET', '/api/ai-provider')).data.provider, null);
});

test('only admins see or change the provider, and the key never comes back', async () => {
  assert.equal((await ana('GET', '/api/ai-provider')).status, 403);
  assert.equal((await ana('PUT', '/api/ai-provider', { kind: 'anthropic', model: 'test-model', apiKey: ANTHROPIC_KEY })).status, 403);
  assert.equal((await ana('POST', '/api/ai-provider/test', { kind: 'anthropic', model: 'test-model', apiKey: ANTHROPIC_KEY })).status, 403);
  assert.equal((await ana('DELETE', '/api/ai-provider')).status, 403);

  assert.match((await save({ kind: 'anthropic', model: 'test-model' })).data.error, /API key/);
  const saved = await save({ kind: 'anthropic', model: 'test-model', apiKey: ANTHROPIC_KEY });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.provider.keySet, true);
  assert.equal(saved.data.provider.keyTail, ANTHROPIC_KEY.slice(-4));
  for (const res of [saved, await owner('GET', '/api/ai-provider'), await owner('GET', '/api/bootstrap'), await ana('GET', '/api/bootstrap'), await owner('GET', '/api/agents')]) {
    assert.ok(!JSON.stringify(res.data).includes(ANTHROPIC_KEY));
  }

  const boot = (await ana('GET', '/api/bootstrap')).data;
  assert.equal(boot.ai, true);
  assert.deepEqual(boot.aiProvider, { name: 'Anthropic', kind: 'anthropic', model: 'test-model', source: 'workspace' });

  // the model changes and the saved key stays
  const renamed = await save({ kind: 'anthropic', model: 'test-model-2' });
  assert.equal(renamed.data.provider.keySet, true);
  await save({ kind: 'anthropic', model: 'test-model' });
});

test('every feature runs on the workspace’s Claude key, through the official SDK', async () => {
  const before_ = claude.requests.length;
  for (const [name, body] of features(ids.task)) {
    const res = await ana('POST', `/api/ai/${name}`, body);
    assert.equal(res.status, 200, `${name}: ${JSON.stringify(res.data)}`);
  }
  const sent = claude.requests.slice(before_);
  assert.equal(sent.length, 6);
  for (const req of sent) {
    assert.equal(req.path, '/v1/messages?beta=true');
    assert.equal(req.headers['x-api-key'], ANTHROPIC_KEY);
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.body.model, 'test-model');
  }
  const breakdown = sent[1];
  assert.equal(breakdown.body.output_config.format.type, 'json_schema');
  const steps = (await ana('POST', '/api/ai/breakdown', { taskId: ids.task })).data.steps;
  assert.deepEqual(steps, ['Write the outline', 'Ship it']);
});

test('OpenAI: chat completions with structured outputs, and a key saved for Claude never goes to OpenAI', async () => {
  assert.match((await save({ kind: 'openai', model: 'test-model' })).data.error, /API key/);
  const saved = await save({ kind: 'openai', model: 'test-model', apiKey: OPENAI_KEY });
  assert.equal(saved.data.provider.keyTail, OPENAI_KEY.slice(-4));
  assert.equal((await ana('GET', '/api/bootstrap')).data.aiProvider.name, 'OpenAI');

  const before_ = openai.requests.length;
  for (const [name, body] of features(ids.task)) assert.equal((await ana('POST', `/api/ai/${name}`, body)).status, 200, name);
  const sent = openai.requests.slice(before_);
  assert.equal(sent.length, 6);
  for (const req of sent) {
    assert.equal(req.path, '/v1/chat/completions');
    assert.equal(req.headers.authorization, `Bearer ${OPENAI_KEY}`);
    assert.equal(req.body.model, 'test-model');
    assert.equal(typeof req.body.max_completion_tokens, 'number');
  }
  assert.equal(sent[1].body.response_format.type, 'json_schema');
  assert.equal(sent[1].body.response_format.json_schema.strict, true);
  const tasks = (await ana('POST', '/api/ai/extract', { text: 'Ana books the venue.' })).data.tasks;
  assert.equal(tasks[0].title, 'Book the venue');
});

test('an OpenAI-compatible provider that lacks structured outputs still answers in JSON', async () => {
  const address = `${compatible.url}/v1`;
  const saved = await save({ kind: 'compatible', baseUrl: address, model: 'test-model' });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.provider.keySet, false);
  assert.equal((await ana('GET', '/api/bootstrap')).data.aiProvider.name, new URL(compatible.url).host);

  compatible.script([
    { status: 400, body: { error: { message: 'max_tokens is not supported here' } } },
    { status: 400, body: { error: { message: 'response_format json_schema is not supported' } } },
    { status: 400, body: { error: { message: 'response_format json_object is not supported' } } },
  ]);
  const before_ = compatible.requests.length;
  const res = await ana('POST', '/api/ai/breakdown', { taskId: ids.task });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.steps, ['Write the outline', 'Ship it']);
  const sent = compatible.requests.slice(before_);
  assert.equal(sent.length, 4);
  assert.equal(sent[0].body.max_tokens > 0, true);
  assert.equal(sent[1].body.max_tokens, undefined);
  assert.equal(sent[1].body.response_format.type, 'json_schema');
  assert.equal(sent[2].body.response_format.type, 'json_object');
  assert.equal(sent[3].body.response_format, undefined);
  assert.match(promptOf(sent[3].body), /Reply with only a JSON object/);
  assert.ok(sent.every((req) => req.headers.authorization === undefined), 'no key, no Authorization header');

  // a key saved for one address never goes to another
  await save({ kind: 'compatible', baseUrl: address, model: 'test-model', apiKey: COMPATIBLE_KEY });
  await ana('POST', '/api/ai/draft', { instruction: 'One line', title: '', context: '' });
  assert.equal(compatible.requests.at(-1).headers.authorization, `Bearer ${COMPATIBLE_KEY}`);
  const moved = await save({ kind: 'compatible', baseUrl: `${openai.url}/v1`, model: 'test-model' });
  assert.equal(moved.data.provider.keySet, false);
  await save({ kind: 'compatible', baseUrl: address, model: 'test-model' });
});

test('an address inside the cloud provider is refused, local endpoints allowed or not', async () => {
  for (const baseUrl of ['http://169.254.169.254/v1', 'http://[fd00:ec2::254]/v1', 'http://100.100.100.200/v1']) {
    const res = await save({ kind: 'compatible', baseUrl, model: 'test-model' });
    assert.equal(res.status, 400, baseUrl);
  }
});

test('Test connection makes one tiny request and says plainly what went wrong', async () => {
  openai.script([{ status: 401, body: { error: { message: 'Incorrect API key provided' } } }]);
  const bad = (await owner('POST', '/api/ai-provider/test', { kind: 'openai', model: 'test-model', apiKey: 'sk-wrong' })).data;
  assert.equal(bad.ok, false);
  assert.match(bad.error, /refused the key/);
  const good = (await owner('POST', '/api/ai-provider/test', { kind: 'openai', model: 'test-model', apiKey: OPENAI_KEY })).data;
  assert.equal(good.ok, true, good.error);
  assert.equal(typeof good.ms, 'number');
  assert.equal(openai.requests.at(-1).body.messages.at(-1).content, 'Reply with the single word OK.');
  // testing saves nothing
  assert.equal((await owner('GET', '/api/ai-provider')).data.provider.kind, 'compatible');
  // a key saved for another provider isn't used for the test
  assert.match((await owner('POST', '/api/ai-provider/test', { kind: 'anthropic', model: 'test-model' })).data.error, /API key/);
});

test('removing the provider turns built-in AI off again', async () => {
  const res = await owner('DELETE', '/api/ai-provider');
  assert.equal(res.data.provider, null);
  assert.equal((await ana('GET', '/api/bootstrap')).data.ai, false);
  assert.equal((await ana('POST', '/api/ai/draft', { instruction: 'One line', title: '', context: '' })).status, 503);
});

test('no key ever reaches the logs or sits in the clear in the data folder', async () => {
  // one failure that gets logged, with a provider that can't be reached
  await save({ kind: 'compatible', baseUrl: 'http://127.0.0.1:9/v1', model: 'test-model', apiKey: COMPATIBLE_KEY });
  assert.equal((await ana('POST', '/api/ai/draft', { instruction: 'One line', title: '', context: '' })).status, 502);
  await save({ kind: 'anthropic', model: 'test-model', apiKey: ANTHROPIC_KEY });
  const text = logged.join('');
  assert.match(text, /An AI request failed/);
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `${secret.slice(0, 8)}… in the logs`);
  for (const file of filesUnder(srv.dataDir)) {
    const bytes = fs.readFileSync(file);
    for (const secret of SECRETS) assert.ok(!bytes.includes(secret), `${secret.slice(0, 8)}… in ${path.basename(file)}`);
  }
});
