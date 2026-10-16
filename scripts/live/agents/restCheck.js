// The agent REST API, driven only by its own OpenAPI document: every operation, idempotency
// keys, rate-limit headers, the error shape and each documented error code that can be
// produced from outside.
//
//   node restCheck.js
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import openapiClient from './lib/openapiClient.js';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({ options: { state: { type: 'string', default: process.env.LIVE_STATE } } });
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const t = checks('REST API from the OpenAPI document');
const owner = session(state.url, { cookie: state.people.owner.cookie });
const ana = session(state.url, { cookie: state.people.ana.cookie });
const specUrl = `${state.url}/api/agent/v1/openapi.json`;
const api = await openapiClient(specUrl, { key: state.agents.scout.key });
const tk = state.tasks;
const isError = (res, status, code) => res.status === status && res.data?.error?.status === status && res.data.error.code === code && typeof res.data.error.message === 'string';
const idem = () => crypto.randomUUID();

// The document itself
const spec = api.spec;
t.ok(spec.openapi === '3.1.0', 'OpenAPI 3.1 document', spec.openapi);
t.ok(spec.servers[0].url === `${state.url}/api/agent/v1`, 'server URL comes from APP_URL', spec.servers[0].url);
t.ok(api.operations.size === 21, '21 operations, one per tool', api.operations.size);
const raw = await fetch(specUrl);
t.ok(raw.headers.get('access-control-allow-origin') === '*', 'the document can be fetched cross-origin');

// Every operation, as the agent
const seen = new Set();
const op = async (id, args, expect, what, opts) => {
  seen.add(id);
  const res = await api.call(id, args, opts);
  t.ok(expect(res) && res.declared, `${id}: ${what}`, `${res.status} ${JSON.stringify(res.data).slice(0, 220)}`);
  return res;
};
const created = await op('create_task', { title: 'Write release notes for 3.1', project: 'Website', checklist: ['Collect merged changes', 'Draft', 'Review'] }, (r) => r.status === 201 && r.data.created?.key, 'creates a task (201)', { idempotencyKey: idem() });
const mine = created.data.created?.key;
await op('whoami', {}, (r) => r.status === 200 && r.data.kind === 'agent', 'the agent behind the key');
await op('workspace_summary', {}, (r) => r.status === 200 && typeof r.data.open === 'number', 'counts');
await op('my_assignments', { limit: 5 }, (r) => r.status === 200 && Array.isArray(r.data.tasks), 'assignments with a limit');
await op('my_inbox', { unreadOnly: true }, (r) => r.status === 200 && Array.isArray(r.data.items), 'inbox, unread only');
await op('mark_inbox_read', { all: true }, (r) => r.status === 200 && r.data.unread === 0, 'marks read');
await op('list_tasks', { status: 'todo', project: 'Website' }, (r) => r.status === 200 && r.data.tasks.every((x) => x.status === 'todo'), 'filtered list');
await op('search_tasks', { query: 'Safari' }, (r) => r.status === 200 && r.data.tasks[0]?.key === tk.loginBug.key, '/tasks/search is a search, not a task called "search"');
const read = await op('get_task', { key: mine }, (r) => r.status === 200 && r.data.checklist.length === 3, 'one task with checklist ids');
await op('list_projects', {}, (r) => r.status === 200 && r.data.projects.length === 1, 'its project');
await op('list_labels', {}, (r) => r.status === 200 && Array.isArray(r.data.labels), 'labels');
await op('list_people', {}, (r) => r.status === 200 && r.data.people.some((p) => p.handle), 'people with handles');
await op('list_goals', {}, (r) => r.status === 200 && Array.isArray(r.data.goals), 'goals');
await op('claim_task', { key: mine }, (r) => r.status === 200 && r.data.claimed.status === 'in_progress', 'claims and starts', { idempotencyKey: idem() });
await op('update_task', { key: mine, checklistTick: [read.data.checklist[0].id], status: 'in_progress' }, (r) => r.status === 200 && r.data.updated.checklist[0].done, 'ticks a checklist item', { idempotencyKey: idem() });
await op('add_comment', { key: mine, text: 'Collected the merged changes; drafting next.' }, (r) => r.status === 201 && r.data.commentId, 'comments (201)', { idempotencyKey: idem() });
await op('watch_task', { key: tk.migration.key, watching: true }, (r) => r.status === 200 && r.data.watching === true, 'watches');
await op('start_time_entry', { key: mine }, (r) => r.status === 200 && r.data.running, 'starts a timer', { idempotencyKey: idem() });
await op('stop_time_entry', {}, (r) => r.status === 200 && r.data.stopped, 'stops it', { idempotencyKey: idem() });
const parked = await op('delete_task', { key: mine }, (r) => r.status === 202 && r.data.status === 'pending_approval' && r.data.approval.id, 'parks for approval (202)', { idempotencyKey: idem() });
await op('get_approval', { id: parked.data.approval?.id }, (r) => r.status === 200 && r.data.status === 'pending', 'pending approval');
t.ok([...api.operations.keys()].every((k) => seen.has(k)), 'every operation was called', [...api.operations.keys()].filter((k) => !seen.has(k)).join(','));

// Idempotency
const key1 = idem();
const first = await api.call('add_comment', { key: tk.loginBug.key, text: 'Repro: Safari 18.1, no extensions, button stays grey.' }, { idempotencyKey: key1 });
const again = await api.call('add_comment', { key: tk.loginBug.key, text: 'Repro: Safari 18.1, no extensions, button stays grey.' }, { idempotencyKey: key1 });
t.ok(first.status === 201 && again.status === 201 && again.data.commentId === first.data.commentId, 'same key, same request: the first response comes back');
t.ok(again.headers.get('idempotency-replayed') === 'true', 'the replay is marked Idempotency-Replayed: true');
const comments = (await api.call('get_task', { key: tk.loginBug.key })).data.comments ?? [];
t.ok(comments.filter((c) => /button stays grey/.test(c.text ?? c.body ?? '')).length === 1, 'the comment exists once', comments.length);
const reused = await api.call('add_comment', { key: tk.loginBug.key, text: 'Something else' }, { idempotencyKey: key1 });
t.ok(isError(reused, 409, 'idempotency_conflict'), 'same key, different request: 409 idempotency_conflict', JSON.stringify(reused.data));
const badKey = await api.call('add_comment', { key: tk.loginBug.key, text: 'x' }, { idempotencyKey: 'has spaces in it' });
t.ok(isError(badKey, 400, 'invalid_idempotency_key'), 'a malformed Idempotency-Key: 400', JSON.stringify(badKey.data));

// Rate-limit headers, and a real 429 on an agent with a tiny limit
const me = await api.call('whoami');
t.ok(['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'].every((h) => me.headers.get(h) !== null), 'RateLimit-* headers on every response', ['limit', 'remaining', 'reset'].map((h) => me.headers.get(`ratelimit-${h}`)).join('/'));
const slow = await owner('POST', '/api/agents', { name: `Throttle${Date.now() % 10000}`, access: 'read', projectIds: [state.projects.website], runner: 'external', rateLimit: 3 });
const slowApi = await openapiClient(specUrl, { key: slow.data.key });
const burst = [];
for (let i = 0; i < 4; i++) burst.push(await slowApi.call('whoami'));
t.ok(burst.slice(0, 3).every((r) => r.status === 200) && burst[2].headers.get('ratelimit-remaining') === '0', 'three calls fit a limit of 3', burst.map((r) => r.status).join(','));
t.ok(isError(burst[3], 429, 'rate_limited') && Number(burst[3].headers.get('retry-after')) > 0, 'the fourth is 429 rate_limited with Retry-After', `${burst[3].status} retry-after=${burst[3].headers.get('retry-after')}`);

// Error shape and codes
t.ok(isError(await api.call('whoami', {}, { auth: null }), 401, 'unauthorized'), '401 unauthorized without a key');
const wrong = await api.call('whoami', {}, { auth: 'nonos_agt_not-a-real-key' });
t.ok(isError(wrong, 401, 'unauthorized') && /invalid_token/.test(wrong.headers.get('www-authenticate') ?? ''), '401 unauthorized with a wrong key, WWW-Authenticate set');
t.ok(isError(await api.call('get_task', { key: 'NON-9999' }), 404, 'not_found'), '404 not_found for a missing task');
t.ok(isError(await api.call('get_task', { key: tk.budget.key }), 404, 'not_found'), '404 not_found for a task outside its projects');
t.ok(isError(await api.call('create_task', { description: 'no title' }, { idempotencyKey: idem() }), 400, 'invalid_arguments'), '400 invalid_arguments without a title');
t.ok(isError(await api.call('my_assignments', { limit: 'lots' }), 400, 'invalid_arguments'), '400 invalid_arguments for a non-number in the query');
const badJson = await fetch(`${api.server}/tasks/${tk.loginBug.key}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${state.agents.scout.key}`, 'Content-Type': 'application/json' }, body: '{"text": ' });
t.ok(isError({ status: badJson.status, data: await badJson.json() }, 400, 'invalid_json'), '400 invalid_json for a broken body');
const nowhere = await fetch(`${api.server}/nowhere`, { headers: { Authorization: `Bearer ${state.agents.scout.key}` } });
t.ok(isError({ status: nowhere.status, data: await nowhere.json() }, 404, 'not_found'), '404 not_found for an unknown endpoint');
const readerApi = await openapiClient(specUrl, { key: state.agents.reader.key });
t.ok(isError(await readerApi.call('add_comment', { key: tk.loginBug.key, text: 'hi' }), 403, 'read_only'), '403 read_only for a read-only agent');
const narrow = await owner('POST', '/api/agents', { name: `Narrow${Date.now() % 10000}`, access: 'write', projectIds: [state.projects.website], runner: 'external', tools: ['whoami', 'get_task'] });
const narrowApi = await openapiClient(specUrl, { key: narrow.data.key });
t.ok(isError(await narrowApi.call('add_comment', { key: tk.loginBug.key, text: 'hi' }), 403, 'tool_not_allowed'), '403 tool_not_allowed for a tool off its list');
const foreign = await api.call('whoami', {}, { headers: { Origin: 'https://evil.example' } });
t.ok(isError(foreign, 403, 'origin_not_allowed'), '403 origin_not_allowed for a foreign browser origin');
const anaTask = (await ana('POST', '/api/tasks', { title: 'Ana owns this', projectId: state.projects.website, assigneeId: state.people.ana.id })).data.task;
t.ok(isError(await api.call('claim_task', { key: `NON-${anaTask.number}` }, { idempotencyKey: idem() }), 409, 'conflict'), '409 conflict when claiming someone else’s task');

await owner('POST', `/api/agents/${state.agents.reader.id}/pause`);
t.ok(isError(await readerApi.call('whoami'), 403, 'agent_paused'), '403 agent_paused while paused');
await owner('POST', `/api/agents/${state.agents.reader.id}/resume`);
t.ok((await readerApi.call('whoami')).status === 200, 'works again after resume');

await owner('PUT', '/api/agent-settings', { enabled: false });
t.ok(isError(await api.call('whoami'), 503, 'agents_disabled'), '503 agents_disabled with the kill switch off');
await owner('PUT', '/api/agent-settings', { enabled: true });
t.ok((await api.call('whoami')).status === 200, 'works again with agents back on');

const rotated = await owner('POST', `/api/agents/${narrow.data.agent.id}/key`);
t.ok(isError(await narrowApi.call('whoami'), 401, 'unauthorized'), 'a rotated key is refused at once');
t.ok((await (await openapiClient(specUrl, { key: rotated.data.key })).call('whoami')).status === 200, 'the new key works');

// A person's own key works on the same API
const pat = await owner('POST', '/api/me/tokens', { name: 'rest check', scope: 'read' });
const patApi = await openapiClient(specUrl, { key: pat.data.token });
const patMe = await patApi.call('whoami');
t.ok(patMe.status === 200 && patMe.data.kind !== 'agent', 'a personal access key works on the REST API', JSON.stringify(patMe.data).slice(0, 120));
t.ok(isError(await patApi.call('add_comment', { key: tk.loginBug.key, text: 'x' }), 403, 'read_only'), 'a read-only personal key is refused a write');

t.done();
