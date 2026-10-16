// What an agent can never see: private tasks (not by key, list, search, inbox or assignment)
// and anything outside its projects. Webhooks carry ids, never task text.
//
//   node privacyCheck.js [--service http://127.0.0.1:4700]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import openapiClient from './lib/openapiClient.js';
import mcpConnect from './lib/mcpConnect.js';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({
  options: {
    state: { type: 'string', default: process.env.LIVE_STATE },
    service: { type: 'string', default: 'http://127.0.0.1:4700' },
  },
});
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const t = checks('Privacy');
const ana = session(state.url, { cookie: state.people.ana.cookie });
const owner = session(state.url, { cookie: state.people.owner.cookie });
const api = await openapiClient(`${state.url}/api/agent/v1/openapi.json`, { key: state.agents.scout.key });
const blob = (n) => crypto.randomBytes(n).toString('base64url');
// a private task as a browser sends it: ciphertext only, with a key for each person on it
const sealedFor = (...ids) => ({ id: blob(16), title: blob(48), description: blob(64), checklist: blob(40), keys: Object.fromEntries(ids.map((id) => [id, blob(92)])) });

const secret = (await ana('POST', '/api/tasks', { private: true, sealed: sealedFor(state.people.ana.id), projectId: state.projects.website })).data.task;
t.ok(secret?.private === true, 'Ana has a private task in Website, where Scout works', JSON.stringify(secret).slice(0, 120));
const key = `NON-${secret.number}`;

const read = await api.call('get_task', { key });
t.ok(read.status === 404 && read.data.error.message === `There’s no task ${key} you can see.`, 'get_task answers as if it didn’t exist', JSON.stringify(read.data));
const listed = await api.call('list_tasks', { limit: 50 });
t.ok(listed.status === 200 && !listed.data.tasks.some((x) => x.key === key || x.private), 'list_tasks leaves it out');
const searched = await api.call('search_tasks', { query: 'a' });
t.ok(!searched.data.tasks?.some((x) => x.private), 'search_tasks never returns a private task');
const summary = await api.call('workspace_summary');
t.ok(summary.status === 200, 'workspace_summary works', JSON.stringify(summary.data).slice(0, 120));
const commenting = await api.call('add_comment', { key, text: 'hello' }, { idempotencyKey: blob(8) });
t.ok(commenting.status === 404, 'it can’t comment on it');
const claiming = await api.call('claim_task', { key }, { idempotencyKey: blob(8) });
t.ok(claiming.status === 404, 'or claim it');

const assign = await ana('PATCH', `/api/tasks/${secret.id}`, { assigneeId: state.agents.scout.id });
t.ok(assign.status === 400 && /Agents can’t work on private tasks/.test(assign.data.error), 'a person can’t assign a private task to an agent', JSON.stringify(assign.data));
const create = await ana('POST', '/api/tasks', { private: true, sealed: sealedFor(state.people.ana.id, state.agents.scout.id), projectId: state.projects.website, assigneeId: state.agents.scout.id });
t.ok(create.status === 400, 'or create one for it', JSON.stringify(create.data));

// outside its projects
const finance = await api.call('get_task', { key: state.tasks.budget.key });
t.ok(finance.status === 404 && /outside this agent’s projects/.test(finance.data.error.message), 'a Finance task is outside its projects, and it says so', JSON.stringify(finance.data));
t.ok(!(await api.call('search_tasks', { query: 'budget review' })).data.tasks.some((x) => x.project === 'Finance'), 'search doesn’t reach Finance');
t.ok((await api.call('list_projects')).data.projects.every((p) => p.name === 'Website'), 'list_projects shows Website only');

// over MCP too
const mcp = await mcpConnect(`${state.url}/mcp`, state.agents.scout.key);
const viaMcp = await mcp.callTool({ name: 'get_task', arguments: { key } });
t.ok(viaMcp.isError && /no task/.test(viaMcp.content[0].text), 'MCP gives the same answer');
await mcp.close();

// webhooks carry ids, not task text: give Scout something sensitive and read what it was sent
let log = [];
try {
  log = await (await fetch(`${opt.service}/log`)).json();
} catch {}
if (Array.isArray(log)) {
  const sensitive = (await ana('POST', '/api/tasks', { title: 'Salary bands for the design team', description: 'Bands: junior 52k, senior 78k.', projectId: state.projects.website, assigneeId: state.agents.scout.id })).data.task;
  await ana('POST', `/api/tasks/${sensitive.id}/comments`, { body: '@Scout the bands are final, keep them to yourself.' });
  await ana('PATCH', `/api/tasks/${sensitive.id}`, { title: 'Salary bands for the design team (final)' });
  await new Promise((r) => setTimeout(r, 4000));
  log = await (await fetch(`${opt.service}/log`)).json();
  const mine = log.filter((e) => e.body?.data?.task?.id === sensitive.id);
  t.ok(mine.length >= 2, `Scout got ${mine.length} deliveries about it (${[...new Set(mine.map((e) => e.event))].join(', ')})`);
  t.ok(mine.every((e) => !/Salary|52k|bands/i.test(e.raw)), 'none of them contains the title, description or comment');
  t.ok(mine.every((e) => e.body.data.task.key === `NON-${sensitive.number}`), 'each carries the task key to read it with');
} else {
  t.note('agent service not reachable; webhook bodies not checked here');
}
t.done();
