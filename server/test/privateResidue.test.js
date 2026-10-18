import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';
import scriptedModel from './helpers/scriptedModel.js';
import until from './helpers/until.js';

// Making a task private encrypts its words in the browser and wipes the server's plain copies.
// Agents used to keep copies the wipe never reached: the run log of every run on the task, the
// run's summary, the approval cards, the arguments in the audit trail, stored idempotent
// replies, and the answers of reads in runs on other tasks, which quoted every task they listed.
let srv;
let sql;
let worker;
let providerFor;
let eraseTasks;
let pruneAgentData;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const ids = {};
const DAY = 86_400_000;

// Every place a copy of a task's words could sit, searched for each word given.
const PLACES = [['agent_steps', 'input'], ['agent_steps', 'output'], ['agent_runs', 'summary'], ['agent_runs', 'context'], ['agent_runs', 'error'], ['agent_idempotency', 'response'], ['agent_audit', 'detail'], ['agent_approvals', 'input'], ['agent_approvals', 'result'], ['notifications', 'data'], ['webhook_deliveries', 'payload'], ['comments', 'body'], ['activity', 'data'], ['tasks', 'title'], ['tasks', 'description']];
const leaks = (...words) => PLACES.flatMap(([table, column]) => words.filter((w) => sql.get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} LIKE ?`, `%${w}%`).n).map((w) => `${table}.${column} has “${w}”`));

const use = (turns) => providerFor.replace(scriptedModel(turns).factory);
const keyOf = (state) => state.user.match(/<task key="([^"]+)"/)[1];
const keyFor = (task) => `${ids.prefix}-${task.number}`;
const agent = (method, url, body, headers = {}) =>
  fetch(base() + `/api/agent/v1${url}`, { method, headers: { Authorization: `Bearer ${ids.extKey}`, 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, replayed: r.headers.get('idempotency-replayed'), text: await r.text() }));
const finished = (taskId, after = 0) => until(() => sql.get("SELECT * FROM agent_runs WHERE task_id = ? AND status IN ('done', 'failed', 'stopped', 'canceled') ORDER BY created_at LIMIT 1 OFFSET ?", taskId, after), { timeoutMs: 10_000, what: 'the run' });

// Seals a task the way its creator's browser does, comments included.
async function seal(c, userId, taskId) {
  const comments = sql.all('SELECT id FROM comments WHERE task_id = ?', taskId).map((r) => ({ id: r.id, body: 'x'.repeat(40) }));
  const res = await c('PATCH', `/api/tasks/${taskId}`, { private: true, sealed: sealed(userId), comments });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

before(async () => {
  srv = await startServer({ env: { ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', AGENT_MODEL: 'test-model', AGENT_RUN_TIMEOUT_SECONDS: '30' } });
  sql = (await import('../db/sql.js')).default;
  worker = (await import('../agents/runner/worker.js')).default;
  providerFor = (await import('../agents/runner/providerFor.js')).default;
  eraseTasks = (await import('../services/eraseTasks.js')).default;
  pruneAgentData = (await import('../jobs/pruneAgentData.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'Acme' });
  for (const [who, c, name] of [['ana', ana, 'Ana Park'], ['ben', ben, 'Ben Holm']]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await c.wallet(wallet(), 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  }
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  ids.prefix = sql.get('SELECT task_prefix FROM workspace').task_prefix;
  ids.builder = (await owner('POST', '/api/agents', { name: 'Builder', color: '#7c4ddb', access: 'write', allProjects: true, runner: 'anthropic' })).data.agent.id;
  const ext = await owner('POST', '/api/agents', { name: 'Ext', color: '#0e9384', access: 'write', allProjects: true, runner: 'external' });
  [ids.ext, ids.extKey] = [ext.data.agent.id, ext.data.key];
  worker.tick();
});
after(async () => {
  await worker.idle();
  providerFor.replace(null);
  srv.close();
});

test('a task made private keeps no words in run logs, summaries, the audit trail, approvals or stored replies', async () => {
  use([(state) => ({ text: 'Read it', calls: [{ name: 'get_task', input: { key: keyOf(state) } }] }), { text: 'Summary: the merger offer is 42M.' }]);
  const t = (await ana('POST', '/api/tasks', { projectId: ids.alpha, title: 'SECRET merger with Globex', description: 'Offer price 42M, do not leak', assigneeId: ids.ana })).data.task;
  const key = keyFor(t);
  const first = await agent('PATCH', `/tasks/${key}`, { priority: 'high' }, { 'Idempotency-Key': 'k1' });
  assert.ok(first.text.includes('SECRET merger'));
  // a request parked for approval on the same task
  assert.equal((await agent('DELETE', `/tasks/${key}`)).status, 202);
  await ana('POST', `/api/tasks/${t.id}/comments`, { body: '@Builder please look' });
  const run = await finished(t.id);
  assert.equal(run.status, 'done', run.error);
  assert.ok(leaks('SECRET merger', '42M').length > 0, 'the agents kept copies to begin with');

  await seal(ana, ids.ana, t.id);
  assert.deepEqual(leaks('SECRET merger', 'Offer price', '42M'), []);
  const adminRun = await owner('GET', `/api/agent-runs/${run.id}`);
  assert.equal(adminRun.status, 200);
  assert.deepEqual([adminRun.data.run.steps, adminRun.data.run.summary], [[], null]);
  assert.ok(adminRun.data.run.stepCount > 0, 'the run itself stays, with its counts');
  assert.equal(JSON.stringify((await owner('GET', `/api/agents/${ids.builder}/runs`)).data).includes('42M'), false);
  assert.equal(JSON.stringify((await owner('GET', `/api/agents/${ids.ext}/audit`)).data).includes('SECRET'), false);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM agent_approvals WHERE task_id = ?', t.id).n, 0);

  // the replay doesn't hand back the old answer, and doesn't make the change again either
  assert.equal((await agent('GET', `/tasks/${key}`)).status, 404);
  const replay = await agent('PATCH', `/tasks/${key}`, { priority: 'high' }, { 'Idempotency-Key': 'k1' });
  assert.equal(replay.status, 404);
  assert.equal(replay.replayed, null);
  assert.equal(JSON.parse(replay.text).error.code, 'not_found');
  assert.equal(sql.get('SELECT status FROM agent_idempotency WHERE key = ?', 'k1').status, 404);
});

test('reads in runs on other tasks keep which tasks they saw, not what those tasks say', async () => {
  use([{ text: 'Looking around', calls: [{ name: 'list_tasks', input: { status: 'open' } }, { name: 'search_tasks', input: { query: 'layoffs' } }] }, { text: 'Done.' }]);
  const secret = (await ana('POST', '/api/tasks', { projectId: ids.alpha, title: 'SECRET layoffs list for Q1', description: 'Names: Dana, Eli', assigneeId: ids.ana })).data.task;
  const other = (await ben('POST', '/api/tasks', { projectId: ids.alpha, title: 'Plan the offsite' })).data.task;
  await ben('POST', `/api/tasks/${other.id}/comments`, { body: '@Builder what else is open?' });
  await finished(other.id);
  const [listed, searched] = sql.all("SELECT * FROM agent_steps WHERE run_id IN (SELECT id FROM agent_runs WHERE task_id = ?) AND kind = 'tool' ORDER BY seq", other.id);
  assert.match(listed.output, new RegExp(`${keyFor(secret)}.*\\(\\d+ tasks\\)\\nOnly this summary is kept`));
  assert.match(searched.output, new RegExp(`^${keyFor(secret)} \\(1 task\\)`));

  await seal(ana, ids.ana, secret.id);
  assert.equal((await ben('GET', `/api/tasks/${secret.id}/detail`)).status, 404);
  const activity = JSON.stringify((await ben('GET', `/api/tasks/${other.id}/agent-activity`)).data);
  assert.equal(activity.includes('SECRET layoffs'), false);
  assert.deepEqual(leaks('SECRET layoffs', 'Dana, Eli'), []);
});

test('a write in another run’s log is wiped when the task it changed turns private', async () => {
  const target = (await ana('POST', '/api/tasks', { projectId: ids.alpha, title: 'SECRET board seat offer', description: 'Seat for Hana', assigneeId: ids.ana })).data.task;
  use([{ text: 'Raising it', calls: [{ name: 'update_task', input: { key: keyFor(target), priority: 'urgent' } }] }, { text: 'Raised it.' }]);
  const home = (await ben('POST', '/api/tasks', { projectId: ids.alpha, title: 'Weekly triage' })).data.task;
  await ben('POST', `/api/tasks/${home.id}/comments`, { body: '@Builder raise the board seat task' });
  await finished(home.id);
  const step = () => sql.get("SELECT * FROM agent_steps WHERE run_id IN (SELECT id FROM agent_runs WHERE task_id = ?) AND tool = 'update_task'", home.id);
  assert.equal(step().task_id, target.id);
  assert.ok(step().output.includes('Seat for Hana'));

  await seal(ana, ids.ana, target.id);
  assert.equal(step().input, null);
  assert.match(step().output, /made private or erased/);
  assert.deepEqual(leaks('SECRET board seat', 'Seat for Hana'), []);
});

test('a run still going on a task that turns private stops and writes nothing more', async () => {
  const hang = (state, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true }));
  use([(state) => ({ text: 'Reading', calls: [{ name: 'get_task', input: { key: keyOf(state) } }] }), hang]);
  const t = (await ana('POST', '/api/tasks', { projectId: ids.alpha, title: 'SECRET pay bands', description: 'Band 4 tops out at 180k', assigneeId: ids.ana })).data.task;
  await ana('POST', `/api/tasks/${t.id}/comments`, { body: '@Builder have a look' });
  await until(() => sql.get("SELECT 1 FROM agent_steps s JOIN agent_runs r ON r.id = s.run_id WHERE r.task_id = ? AND s.tool = 'get_task'", t.id), { what: 'the run to read the task' });

  await seal(ana, ids.ana, t.id);
  const run = await finished(t.id);
  assert.deepEqual([run.status, run.error, run.summary], ['canceled', 'The task was made private.', null]);
  assert.deepEqual(sql.all('SELECT kind FROM agent_steps WHERE run_id = ?', run.id).map((s) => s.kind), ['note']);
  assert.deepEqual(leaks('SECRET pay bands', '180k'), []);
});

test('erasing a task wipes what agents kept of it right away, including what an agent created', async () => {
  const made = await agent('POST', '/tasks', { title: 'SECRET vendor shortlist', project: 'Alpha' }, { 'Idempotency-Key': 'create-1' });
  assert.equal(made.status, 201, made.text);
  const created = sql.get("SELECT id FROM tasks WHERE title = 'SECRET vendor shortlist'").id;
  assert.equal(sql.get("SELECT task_id FROM agent_audit WHERE action = 'create_task' ORDER BY id DESC LIMIT 1").task_id, created);
  assert.equal(sql.get("SELECT task_id FROM agent_idempotency WHERE key = 'create-1'").task_id, created);

  eraseTasks([created]);
  assert.deepEqual(leaks('SECRET vendor shortlist'), []);
  // the key is still spent: a retry creates nothing new
  const retry = await agent('POST', '/tasks', { title: 'SECRET vendor shortlist', project: 'Alpha' }, { 'Idempotency-Key': 'create-1' });
  assert.equal(retry.status, 404);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM tasks WHERE title = 'SECRET vendor shortlist'").n, 0);
});

test('retention reaches decided approvals and stored replies, and the write-ahead log is emptied', async () => {
  const t = (await owner('POST', '/api/tasks', { projectId: ids.alpha, title: 'Old work' })).data.task;
  for (const [id, status] of [['old-decided', 'declined'], ['old-pending', 'pending']]) {
    sql.run("INSERT INTO agent_approvals (id, agent_id, task_id, tool, input, reasons, status, created_at) VALUES (?, ?, ?, 'delete_task', '{}', '[]', ?, ?)", id, ids.ext, t.id, status, Date.now() - 3 * DAY);
  }
  sql.run("INSERT INTO agent_idempotency (principal, key, request_hash, status, response, created_at) VALUES ('agent:x', 'old-key', 'h', 200, '{}', ?)", Date.now() - 3 * DAY);
  await owner('PATCH', '/api/privacy', { retention: { activityDays: 1 } });
  pruneAgentData();
  assert.equal(fs.statSync(path.join(srv.dataDir, 'nonos.db-wal'), { throwIfNoEntry: false })?.size ?? 0, 0);
  assert.deepEqual(sql.all("SELECT id FROM agent_approvals WHERE id LIKE 'old-%'").map((r) => r.id), ['old-pending']);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM agent_idempotency WHERE key = 'old-key'").n, 0);
  await owner('PATCH', '/api/privacy', { retention: { activityDays: 0 } });
});
