import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';
import agentCalls from './helpers/agentCalls.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const { tool, rest, mcp } = agentCalls(base);
const ids = {};
let key;
let sql;

before(async () => {
  srv = await startServer();
  sql = (await import('../db/sql.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallet(), 'invite', { name: 'Ana Park', inviteToken: inv.data.token });
  ids.owner = (await owner('GET', '/api/bootstrap')).data.me.id;
  ids.ana = (await ana('GET', '/api/bootstrap')).data.me.id;
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  ids.beta = (await owner('POST', '/api/projects', { name: 'Beta', color: '#0e9384' })).data.project.id;
});
after(() => srv.close());

test('admins add agents; members see them without the settings; only admins manage them', async () => {
  const created = await owner('POST', '/api/agents', {
    name: 'Scout',
    color: '#7c4ddb',
    description: 'Triages new bugs.',
    instructions: 'Label bugs and ask for steps to reproduce.',
    access: 'write',
    projectIds: [ids.alpha],
    runner: 'external',
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.match(created.data.key, /^nonos_agt_[\w-]{43}$/);
  key = created.data.key;
  ids.scout = created.data.agent.id;
  assert.equal(created.data.agent.access, 'write');
  assert.deepEqual(created.data.agent.projectIds, [ids.alpha]);
  assert.ok(created.data.agent.tools.includes('update_task'));

  const listed = await owner('GET', '/api/agents');
  assert.equal(listed.data.agents.length, 1);
  assert.equal(JSON.stringify(listed.data).includes(key), false);
  assert.equal(listed.data.agents[0].instructions, 'Label bugs and ask for steps to reproduce.');
  assert.ok(listed.data.options.tools.length > 10);

  const seenByAna = await ana('GET', '/api/agents');
  assert.equal(seenByAna.data.agents[0].name, 'Scout');
  assert.equal(seenByAna.data.agents[0].instructions, undefined);
  assert.equal(seenByAna.data.options, undefined);
  assert.equal((await ana('POST', '/api/agents', { name: 'Rogue' })).status, 403);
  assert.equal((await ana('PATCH', `/api/agents/${ids.scout}`, { access: 'read' })).status, 403);

  assert.equal((await owner('POST', '/api/agents', { name: 'scout' })).status, 400);
  assert.equal((await owner('POST', '/api/agents', { name: 'Ana Park' })).status, 400);
  assert.match((await owner('POST', '/api/agents', { name: 'Local', runner: 'openai' })).data.error, /endpoint/);
  assert.match((await owner('POST', '/api/agents', { name: 'Assistant', runner: 'anthropic' })).data.error, /ANTHROPIC_API_KEY/);

  const boot = await ana('GET', '/api/bootstrap');
  const member = boot.data.users.find((u) => u.id === ids.scout);
  assert.equal(member.kind, 'agent');
  assert.equal(boot.data.users.find((u) => u.id === ids.ana).kind, 'human');
});

test('agents never sign in and never take a paid seat', async () => {
  assert.equal((await owner('GET', '/api/bootstrap')).data.plan.seatsUsed, 2);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?', ids.scout).n, 0);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', ids.scout).n, 0);
  // the app's own API runs on session cookies only, so an agent key gets nowhere there
  const res = await fetch(`${base()}/api/bootstrap`, { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(res.status, 401);
  const team = await owner('PATCH', `/api/users/${ids.scout}`, { role: 'admin' });
  assert.equal(team.status, 400);
  assert.match(team.data.error, /Settings → Agents/);
});

test('agents can be assigned, mentioned and watch tasks like any teammate', async () => {
  const task = (await ana('POST', '/api/tasks', { title: 'Crash on login', projectId: ids.alpha, assigneeId: ids.scout })).data.task;
  ids.crash = task;
  await ana('POST', `/api/tasks/${task.id}/comments`, { body: 'Seen on Android 15. @Scout can you reproduce?' });
  const inbox = (await tool(key, 'my_inbox')).structuredContent.items;
  assert.deepEqual(inbox.map((n) => n.type).sort(), ['assigned', 'mention']);
  assert.equal(inbox.find((n) => n.type === 'mention').by, 'Ana Park');
  assert.equal((await tool(key, 'my_inbox', { mentionsOnly: true })).structuredContent.items.length, 1);
  const detail = await ana('GET', `/api/tasks/${task.id}/detail`);
  assert.ok(detail.data.watchers.includes(ids.scout));
  const mine = (await tool(key, 'my_assignments')).structuredContent.tasks;
  assert.deepEqual(mine.map((t) => t.key), [`NON-${task.number}`]);
});

test('an agent sees its projects and its own tasks, and never a private task', async () => {
  const outside = (await ana('POST', '/api/tasks', { title: 'Beta roadmap', projectId: ids.beta })).data.task;
  const handedOver = (await ana('POST', '/api/tasks', { title: 'Beta bug for Scout', projectId: ids.beta, assigneeId: ids.scout })).data.task;
  const hidden = await tool(key, 'get_task', { key: `NON-${outside.number}` });
  assert.equal(hidden.isError, true);
  assert.equal(hidden.content[0].text, `NON-${outside.number} is outside this agent’s projects. An admin can add its project in Settings → Agents.`);
  assert.equal((await tool(key, 'get_task', { key: `NON-${handedOver.number}` })).structuredContent.title, 'Beta bug for Scout');
  const listed = (await tool(key, 'list_tasks')).structuredContent.tasks.map((t) => t.title);
  assert.ok(listed.includes('Crash on login') && listed.includes('Beta bug for Scout'));
  assert.ok(!listed.includes('Beta roadmap'));
  assert.deepEqual((await tool(key, 'list_projects')).structuredContent.projects.map((p) => p.name), ['Alpha']);

  const secret = (await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana), projectId: ids.alpha })).data.task;
  // a private task answers exactly like one that doesn't exist
  assert.equal((await tool(key, 'get_task', { key: `NON-${secret.number}` })).content[0].text, `There’s no task NON-${secret.number} you can see.`);
  assert.equal((await tool(key, 'get_task', { key: 'NON-9999' })).content[0].text, 'There’s no task NON-9999 you can see.');
  assert.equal((await tool(key, 'search_tasks', { query: 'a' })).structuredContent.tasks.some((t) => t.private), false);
  assert.equal((await tool(key, 'workspace_summary')).structuredContent.open, 2);
  const refused = await ana('PATCH', `/api/tasks/${secret.id}`, { assigneeId: ids.scout });
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /Agents can’t work on private tasks/);

  const me = (await tool(key, 'whoami')).structuredContent;
  assert.equal(me.kind, 'agent');
  assert.deepEqual(me.projects, ['Alpha']);
  assert.match(me.privateWork, /never see or read them/);
  const init = await mcp(key, 'initialize', { protocolVersion: '2025-06-18' });
  assert.match(init.body.result.instructions, /can never see or read them/);
});

test('an agent widened to every project sees them all, still without private tasks', async () => {
  await owner('PATCH', `/api/agents/${ids.scout}`, { allProjects: true });
  const listed = (await tool(key, 'list_tasks')).structuredContent.tasks.map((t) => t.title);
  assert.ok(listed.includes('Beta roadmap'));
  assert.equal(listed.length, 3);
  await owner('PATCH', `/api/agents/${ids.scout}`, { allProjects: false });
  assert.equal((await tool(key, 'list_tasks')).structuredContent.tasks.length, 2);
});

test('every agent action is attributed to the agent and audited', async () => {
  const out = await tool(key, 'update_task', { key: `NON-${ids.crash.number}`, priority: 'high' });
  assert.equal(out.isError, undefined);
  const detail = (await ana('GET', `/api/tasks/${ids.crash.id}/detail`)).data;
  const change = detail.activity.find((a) => a.type === 'priority');
  assert.equal(change.actorId, ids.scout);
  assert.equal(change.actingForId, null);
  const trail = (await owner('GET', `/api/agents/${ids.scout}/audit`)).data.entries;
  const entry = trail.find((e) => e.action === 'update_task');
  assert.equal(entry.via, 'mcp');
  assert.equal(entry.outcome, 'ok');
  assert.equal(entry.taskId, ids.crash.id);
  assert.ok(trail.some((e) => e.action === 'agent_created' && e.actorId === ids.owner));
  assert.equal((await ana('GET', `/api/agents/${ids.scout}/audit`)).status, 403);
});

test('pausing, rotating the key and the kill switch stop an agent at once', async () => {
  await owner('POST', `/api/agents/${ids.scout}/pause`);
  assert.equal((await mcp(key, 'ping')).status, 403);
  const paused = await rest(key, 'GET', '/me');
  assert.equal(paused.status, 403);
  assert.equal(paused.data.error.code, 'agent_paused');
  await owner('POST', `/api/agents/${ids.scout}/resume`);
  assert.equal((await rest(key, 'GET', '/me')).status, 200);

  const rotated = await owner('POST', `/api/agents/${ids.scout}/key`);
  assert.match(rotated.data.key, /^nonos_agt_/);
  assert.equal((await rest(key, 'GET', '/me')).status, 401);
  key = rotated.data.key;
  assert.equal((await rest(key, 'GET', '/me')).status, 200);

  assert.equal((await ana('PUT', '/api/agent-settings', { enabled: false })).status, 403);
  assert.equal((await owner('PUT', '/api/agent-settings', { enabled: false })).data.settings.enabled, false);
  const off = await rest(key, 'GET', '/me');
  assert.equal(off.status, 503);
  assert.equal(off.data.error.code, 'agents_disabled');
  assert.equal((await mcp(key, 'ping')).status, 503);
  // events still reach people, but agents hear nothing while the switch is off
  await ana('POST', `/api/tasks/${ids.crash.id}/comments`, { body: '@Scout ping while off' });
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM webhook_deliveries').n, 0);
  await owner('PUT', '/api/agent-settings', { enabled: true });
  assert.equal((await rest(key, 'GET', '/me')).status, 200);
});

test('deleting an agent revokes it, hands its work back and keeps the history', async () => {
  const before = (await ana('GET', `/api/tasks/${ids.crash.id}/detail`)).data.activity.filter((a) => a.actorId === ids.scout).length;
  assert.ok(before > 0);
  assert.equal((await owner('DELETE', `/api/agents/${ids.scout}`)).status, 200);
  assert.equal((await rest(key, 'GET', '/me')).status, 401);
  const task = (await ana('GET', `/api/tasks/${ids.crash.id}/detail`)).data;
  assert.equal(task.task.assigneeId, null);
  assert.equal(task.activity.filter((a) => a.actorId === ids.scout).length, before);
  assert.ok(!task.watchers.includes(ids.scout));
  const boot = (await owner('GET', '/api/bootstrap')).data;
  assert.equal(boot.users.find((u) => u.id === ids.scout).deactivated, true);
  assert.equal((await owner('GET', '/api/agents')).data.agents.length, 0);
  assert.ok((await owner('GET', `/api/agents/${ids.scout}/audit`)).status === 404);
  assert.ok(sql.get("SELECT 1 FROM agent_audit WHERE agent_id = ? AND action = 'agent_removed'", ids.scout));
  assert.equal(sql.get('SELECT instructions, api_key_ct FROM agents WHERE user_id = ?', ids.scout).instructions, '');
  // the name is free again
  assert.equal((await owner('POST', '/api/agents', { name: 'Scout' })).status, 200);
});
