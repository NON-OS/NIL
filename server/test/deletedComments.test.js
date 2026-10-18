import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import scriptedModel from './helpers/scriptedModel.js';
import until from './helpers/until.js';

// A notification quotes the start of the comment it's about, and a built-in agent's briefing
// quotes the latest comments on its task. Both used to keep a comment's words after it was
// deleted, edited or erased by the retention policy.
let srv;
let sql;
let purge;
let worker;
let providerFor;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ids = {};
const DAY = 86_400_000;

const inbox = async () => JSON.stringify((await ana('GET', '/api/notifications')).data);
const agentInbox = async () => (await fetch(`${base()}/api/agent/v1/me/inbox`, { headers: { Authorization: `Bearer ${ids.extKey}` } })).text();
const briefings = (taskId) => sql.all("SELECT s.output FROM agent_steps s JOIN agent_runs r ON r.id = s.run_id WHERE r.task_id = ? AND s.kind = 'brief'", taskId).map((s) => s.output).join('\n');
const comment = async (taskId, body) => (await owner('POST', `/api/tasks/${taskId}/comments`, { body })).data.comment;

async function briefedRun(taskId, body) {
  const before = sql.get('SELECT COUNT(*) AS n FROM agent_runs WHERE task_id = ?', taskId).n;
  const posted = await comment(taskId, body);
  await until(() => sql.get("SELECT 1 FROM agent_runs WHERE task_id = ? AND status = 'done' LIMIT 1 OFFSET ?", taskId, before), { timeoutMs: 10_000, what: 'the run' });
  return posted;
}

before(async () => {
  srv = await startServer({ env: { ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', AGENT_MODEL: 'test-model' } });
  sql = (await import('../db/sql.js')).default;
  purge = (await import('../jobs/purge.js')).default;
  worker = (await import('../agents/runner/worker.js')).default;
  providerFor = (await import('../agents/runner/providerFor.js')).default;
  providerFor.replace(scriptedModel([{ text: 'Noted.' }]).factory);
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await ana.wallet(wallet(), 'invite', { name: 'Ana Park', inviteToken: inv.data.token })).data.user.id;
  ids.extKey = (await owner('POST', '/api/agents', { name: 'Ext', color: '#0e9384', access: 'read', allProjects: true, runner: 'external' })).data.key;
  await owner('POST', '/api/agents', { name: 'Builder', color: '#7c4ddb', access: 'write', allProjects: true, runner: 'anthropic' });
  worker.tick();
  ids.task = (await owner('POST', '/api/tasks', { title: 'Server migration' })).data.task.id;
});
after(async () => {
  await worker.idle();
  providerFor.replace(null);
  srv.close();
});

test('a deleted comment leaves no excerpt in people’s or agents’ inboxes', async () => {
  const c = await comment(ids.task, '@Ana @Ext the root password is hunter2-prod-7731');
  assert.ok((await inbox()).includes('hunter2-prod-7731'));
  assert.ok((await agentInbox()).includes('hunter2-prod-7731'));
  assert.equal(JSON.parse(sql.get("SELECT data FROM notifications WHERE type = 'mention' ORDER BY id DESC LIMIT 1").data).commentId, c.id);

  assert.equal((await owner('DELETE', `/api/comments/${c.id}`)).status, 200);
  assert.equal((await inbox()).includes('hunter2-prod-7731'), false);
  assert.equal((await agentInbox()).includes('hunter2-prod-7731'), false);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM notifications WHERE data LIKE '%hunter2%'").n, 0);
  // the notification itself stays: Ana was still mentioned
  assert.ok((await ana('GET', '/api/notifications')).data.some((n) => n.type === 'mention' && n.taskId === ids.task));
});

test('an edited comment’s notifications show its new words', async () => {
  const c = await comment(ids.task, '@Ana the door code is 4417');
  assert.equal((await owner('PATCH', `/api/comments/${c.id}`, { body: '@Ana ask me for the door code' })).status, 200);
  const text = await inbox();
  assert.equal(text.includes('4417'), false);
  assert.ok(text.includes('ask me for the door code'));
});

test('notifications from before comment ids are matched by their words', async () => {
  const c = await comment(ids.task, '@Ana the wifi key is pelican-77');
  sql.run("UPDATE notifications SET data = json_remove(data, '$.commentId') WHERE data LIKE '%pelican-77%'");
  await owner('DELETE', `/api/comments/${c.id}`);
  assert.equal((await inbox()).includes('pelican-77'), false);
});

test('a deleted or edited comment leaves the briefings of agent runs that quoted it', async () => {
  const deleted = await briefedRun(ids.task, '@Builder the API token is tok-live-5521, rotate it');
  const edited = await briefedRun(ids.task, '@Builder the staging password is otter-staging-12');
  assert.ok(briefings(ids.task).includes('tok-live-5521'));
  assert.ok(briefings(ids.task).includes('otter-staging-12'));

  await owner('DELETE', `/api/comments/${deleted.id}`);
  await owner('PATCH', `/api/comments/${edited.id}`, { body: '@Builder never mind' });
  const text = briefings(ids.task);
  assert.equal(text.includes('tok-live-5521'), false);
  assert.equal(text.includes('otter-staging-12'), false);
  assert.ok(text.includes(`<comment id="${deleted.id}"`), 'the briefing still shows a comment was there');
  assert.match(text, /changed or removed since/);
  // the rest of the briefing is untouched
  assert.ok(text.includes('Title: Server migration'));
});

test('comment retention erases the excerpts and the briefing quotes of expired comments', async () => {
  const t = (await owner('POST', '/api/tasks', { title: 'Vendor contract' })).data.task.id;
  const old = await briefedRun(t, '@Builder @Ana the vendor discount is 37 percent');
  const fresh = await comment(t, '@Ana the meeting moved to Friday');
  // a notification from before comment ids, about a comment that expires too
  sql.run("INSERT INTO notifications (user_id, type, task_id, data, created_at) VALUES (?, 'comment', ?, json_object('title', 'Vendor contract', 'excerpt', 'legacy quote 9931'), ?)", ids.ana, t, Date.now() - 3 * DAY);
  sql.run('UPDATE comments SET created_at = ? WHERE id = ?', Date.now() - 3 * DAY, old.id);
  assert.ok((await inbox()).includes('37 percent'));
  assert.ok((await inbox()).includes('legacy quote 9931'));

  assert.equal((await owner('PATCH', '/api/privacy', { retention: { commentDays: 1 } })).status, 200);
  purge();
  const text = await inbox();
  assert.equal(text.includes('37 percent'), false);
  assert.equal(text.includes('legacy quote 9931'), false);
  assert.ok(text.includes('the meeting moved to Friday'), 'comments that haven’t expired keep their excerpt');
  assert.equal(briefings(t).includes('37 percent'), false);
  assert.ok(sql.get('SELECT 1 FROM comments WHERE id = ?', fresh.id));
  await owner('PATCH', '/api/privacy', { retention: { commentDays: 0 } });
});
