import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import agentCalls from './helpers/agentCalls.js';
import sealed from './helpers/sealed.js';

let srv;
let sql;
let tools;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const { tool, rest, mcp } = agentCalls(base);
const ids = {};
const keys = {};
const k = (task) => `NON-${task.number}`;

// The same call over MCP and over REST must give the same answer.
async function both(key, name, args, method, path, body) {
  const viaMcp = await tool(key, name, args);
  const viaRest = await rest(key, method, path, body);
  assert.equal(viaMcp.isError, undefined, `${name} over MCP: ${viaMcp.content?.[0]?.text}`);
  assert.ok(viaRest.status < 300, `${name} over REST: ${JSON.stringify(viaRest.data)}`);
  return { mcp: viaMcp.structuredContent, rest: viaRest.data, status: viaRest.status };
}

before(async () => {
  srv = await startServer({ env: { AGENT_BULK_LIMIT: '3', AGENT_RATE_LIMIT: '1000', AGENT_MAX_PENDING_APPROVALS: '3', SIGNIN_CONFIRM_MINUTES: '60' } });
  sql = (await import('../db/sql.js')).default;
  tools = (await import('../mcp/tools.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  for (const [who, name] of [[ana, 'Ana Park'], [ben, 'Ben Ito']]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    const w = wallet();
    await who.wallet(w, 'invite', { name, inviteToken: inv.data.token });
    await who.wallet(w, 'confirm');
  }
  ids.ana = (await ana('GET', '/api/bootstrap')).data.me.id;
  ids.alpha = (await owner('POST', '/api/projects', { name: 'Alpha', color: '#3b4fe0' })).data.project.id;
  ids.beta = (await owner('POST', '/api/projects', { name: 'Beta', color: '#0e9384' })).data.project.id;
  await owner('POST', '/api/labels', { name: 'bug', color: '#d13f3f' });
  await owner('POST', '/api/labels', { name: 'ios', color: '#1f7fb8' });
  ids.goal = (await owner('POST', '/api/goals', { title: 'Ship 2.0' })).data.goal.id;
  const created = await owner('POST', '/api/agents', { name: 'Helper', color: '#7c4ddb', access: 'write', projectIds: [ids.alpha] });
  ids.helper = created.data.agent.id;
  keys.helper = created.data.key;
  const reader = await owner('POST', '/api/agents', { name: 'Reader', color: '#0e9384', access: 'read', allProjects: true });
  keys.reader = reader.data.key;
  ids.task = (await ana('POST', '/api/tasks', { title: 'Fix the login crash', description: 'Happens when the token expires overnight.', projectId: ids.alpha, goalId: ids.goal, checklist: [{ text: 'Reproduce' }, { text: 'Write the fix' }] })).data.task;
  ids.other = (await ana('POST', '/api/tasks', { title: 'Plan the offsite', projectId: ids.beta })).data.task;
});
after(() => srv.close());
// the bulk limit is part of what's tested below; the other tests start with a clean slate
beforeEach(() => sql?.run('DELETE FROM agent_writes'));

test('read tools answer the same over MCP and REST', async () => {
  const me = await both(keys.helper, 'whoami', {}, 'GET', '/me');
  assert.deepEqual(me.mcp, me.rest);
  assert.equal(me.rest.taskPrefix, 'NON');

  const summary = await both(keys.helper, 'workspace_summary', {}, 'GET', '/summary');
  assert.equal(summary.rest.open, 1);

  const listed = await both(keys.helper, 'list_tasks', { status: 'open', project: 'Alpha' }, 'GET', '/tasks?status=open&project=Alpha');
  assert.deepEqual(listed.mcp, listed.rest);
  assert.deepEqual(listed.rest.tasks.map((t) => t.title), ['Fix the login crash']);

  const found = await both(keys.helper, 'search_tasks', { query: 'overnight' }, 'GET', '/tasks/search?query=overnight');
  assert.deepEqual(found.rest.tasks.map((t) => t.key), [k(ids.task)]);

  const read = await both(keys.helper, 'get_task', { key: k(ids.task) }, 'GET', `/tasks/${k(ids.task)}`);
  assert.deepEqual(read.mcp, read.rest);
  assert.equal(read.rest.goal, 'Ship 2.0');
  assert.deepEqual(read.rest.checklist.map((i) => i.text), ['Reproduce', 'Write the fix']);
  assert.ok(read.rest.checklist.every((i) => i.id && i.done === false));

  assert.deepEqual((await both(keys.helper, 'list_projects', {}, 'GET', '/projects')).rest.projects.map((p) => p.name), ['Alpha']);
  assert.deepEqual((await both(keys.helper, 'list_labels', {}, 'GET', '/labels')).rest.labels.map((l) => l.name), ['bug', 'ios']);
  const people = (await both(keys.helper, 'list_people', {}, 'GET', '/people')).rest.people;
  assert.deepEqual(people.map((p) => [p.name, p.kind]), [['Ana Park', 'person'], ['Erik Lind', 'person'], ['Helper', 'agent']]);
  assert.equal(people.find((p) => p.name === 'Ana Park').handle, '@AnaPark');
  const goals = (await both(keys.helper, 'list_goals', {}, 'GET', '/goals')).rest.goals;
  assert.deepEqual(goals.map((g) => [g.title, g.tasksTotal]), [['Ship 2.0', 1]]);
  assert.equal((await both(keys.helper, 'my_assignments', {}, 'GET', '/me/assignments')).rest.count, 0);
});

test('write tools work over both transports, within scope, with idempotency on REST', async () => {
  const viaMcp = await tool(keys.helper, 'create_task', { title: 'Add a crash reporter', project: 'Alpha', labels: ['bug'], checklist: ['Pick a library'], priority: 'medium', dueDate: '2026-12-01' });
  assert.equal(viaMcp.structuredContent.created.priority, 'medium');
  const body = { title: 'Write release notes', project: 'Alpha', labels: ['ios'] };
  const first = await rest(keys.helper, 'POST', '/tasks', body, { 'Idempotency-Key': 'notes-1' });
  assert.equal(first.status, 201);
  const again = await rest(keys.helper, 'POST', '/tasks', body, { 'Idempotency-Key': 'notes-1' });
  assert.equal(again.status, 201);
  assert.equal(again.headers.get('idempotency-replayed'), 'true');
  assert.deepEqual(again.data, first.data);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM tasks WHERE title = 'Write release notes'").n, 1);
  const clash = await rest(keys.helper, 'POST', '/tasks', { ...body, title: 'Something else' }, { 'Idempotency-Key': 'notes-1' });
  assert.equal(clash.status, 409);
  assert.equal(clash.data.error.code, 'idempotency_conflict');
  assert.equal((await rest(keys.helper, 'POST', '/tasks', body, { 'Idempotency-Key': 'has space' })).status, 400);

  sql.run('DELETE FROM agent_writes');
  const read = (await tool(keys.helper, 'get_task', { key: k(ids.task) })).structuredContent;
  const updated = await rest(keys.helper, 'PATCH', `/tasks/${k(ids.task)}`, { status: 'in_progress', priority: 'high', dueDate: '2026-11-20', labelsAdd: ['bug', 'ios'], checklistTick: [read.checklist[0].id], checklistAdd: ['Add a regression test'] });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.updated.status, 'in_progress');
  assert.deepEqual(updated.data.updated.labels.sort(), ['bug', 'ios']);
  assert.deepEqual(updated.data.updated.checklist.map((i) => [i.text, i.done]), [['Reproduce', true], ['Write the fix', false], ['Add a regression test', false]]);
  const dropped = await tool(keys.helper, 'update_task', { key: k(ids.task), labelsRemove: ['ios'], checklistTick: ['Write the fix'] });
  assert.deepEqual(dropped.structuredContent.updated.labels, ['bug']);
  assert.equal(dropped.structuredContent.updated.checklist[1].done, true);
  assert.equal((await tool(keys.helper, 'update_task', { key: k(ids.task), checklistTick: ['no such item'] })).isError, true);

  const comment = await rest(keys.helper, 'POST', `/tasks/${k(ids.task)}/comments`, { text: 'Fixed on the branch. @AnaPark can you check?' });
  assert.equal(comment.status, 201);
  assert.ok((await ana('GET', '/api/notifications')).data.some((n) => n.type === 'mention' && n.actorId === ids.helper));
  assert.equal((await tool(keys.helper, 'add_comment', { key: k(ids.task), text: 'One more note.' })).structuredContent.ok, true);

  sql.run('DELETE FROM agent_writes');
  const free = (await ana('POST', '/api/tasks', { title: 'Triage the inbox', projectId: ids.alpha })).data.task;
  const claimed = await rest(keys.helper, 'POST', `/tasks/${k(free)}/claim`);
  assert.equal(claimed.data.claimed.assignee, 'Helper');
  assert.equal(claimed.data.claimed.status, 'in_progress');
  const mine = await both(keys.helper, 'my_assignments', {}, 'GET', '/me/assignments');
  assert.deepEqual(mine.rest.tasks.map((t) => t.key), [k(free)]);
  const taken = (await ana('POST', '/api/tasks', { title: 'Ana’s own', projectId: ids.alpha, assigneeId: ids.ana })).data.task;
  const refused = await rest(keys.helper, 'POST', `/tasks/${k(taken)}/claim`);
  assert.equal(refused.status, 409);

  const started = await rest(keys.helper, 'POST', '/time/start', { key: k(free), note: 'triage' });
  assert.equal(started.data.running.task, k(free));
  const stopped = await tool(keys.helper, 'stop_time_entry');
  assert.equal(stopped.structuredContent.stopped.note, 'triage');
  assert.equal((await rest(keys.helper, 'POST', '/time/stop')).data.stopped, null);

  await ana('POST', `/api/tasks/${free.id}/comments`, { body: '@Helper thanks for picking this up' });
  const inbox = await both(keys.helper, 'my_inbox', { unreadOnly: true }, 'GET', '/me/inbox?unreadOnly=true');
  assert.deepEqual(inbox.rest.items.map((n) => [n.type, n.task, n.by]), [['mention', k(free), 'Ana Park']]);
  assert.equal(inbox.rest.items[0].excerpt, '@Helper thanks for picking this up');
  const ids_ = inbox.rest.items.map((n) => n.id);
  const marked = await rest(keys.helper, 'POST', '/me/inbox/read', { all: true });
  assert.equal(marked.data.unread, 0);
  assert.equal((await tool(keys.helper, 'mark_inbox_read', { ids: ids_ })).structuredContent.unread, 0);
});

test('the remaining tools work over the other transport too', async () => {
  const free = (await ana('POST', '/api/tasks', { title: 'Sort the bug inbox', projectId: ids.alpha })).data.task;
  assert.equal((await tool(keys.helper, 'claim_task', { key: k(free) })).structuredContent.claimed.assignee, 'Helper');
  assert.equal((await tool(keys.helper, 'start_time_entry', { key: k(free) })).structuredContent.running.task, k(free));
  assert.equal((await rest(keys.helper, 'POST', '/time/stop')).data.stopped.minutes, 0);

  const watched = await rest(keys.helper, 'PUT', `/tasks/${k(ids.other)}/watch`, {});
  assert.equal(watched.status, 404, 'a task outside its reach can’t be watched');
  const watching = await rest(keys.helper, 'PUT', `/tasks/${k(ids.task)}/watch`, {});
  assert.deepEqual(watching.data, { key: k(ids.task), watching: true });
  assert.ok((await ana('GET', `/api/tasks/${ids.task.id}/detail`)).data.watchers.includes(ids.helper));
  assert.equal((await tool(keys.helper, 'watch_task', { key: k(ids.task), watching: false })).structuredContent.watching, false);
  const readerWatch = await tool(keys.reader, 'watch_task', { key: k(ids.task) });
  assert.equal(readerWatch.isError, true, 'following a task is still a change, which a read-only agent can’t make');

  const deletion = await rest(keys.helper, 'DELETE', `/tasks/${k(free)}`);
  assert.equal(deletion.status, 202);
  assert.deepEqual(deletion.data.approval.reasons, ['deletes the task']);
  assert.equal(deletion.data.approval.task, k(free));
  const approved = await owner('POST', `/api/agent-approvals/${deletion.data.approval.id}/approve`);
  assert.equal(approved.data.approval.result.deleted, k(free));
  assert.ok(sql.get('SELECT deleted_at FROM tasks WHERE id = ?', free.id).deleted_at);
});

test('risky changes wait for a person: assigning people, deleting, leaving scope, bulk', async () => {
  const toAna = await rest(keys.helper, 'PATCH', `/tasks/${k(ids.task)}`, { assignee: 'Ana Park' });
  assert.equal(toAna.status, 202);
  assert.equal(toAna.data.status, 'pending_approval');
  assert.deepEqual(toAna.data.approval.reasons, ['assigns work to someone else']);
  assert.equal(sql.get('SELECT assignee_id FROM tasks WHERE id = ?', ids.task.id).assignee_id, null);

  // whoever the task belongs to can decide; other members can't; deciding twice fails
  const card = toAna.data.approval.id;
  const viaMcp = await tool(keys.helper, 'get_approval', { id: card });
  assert.equal(viaMcp.structuredContent.status, 'pending');
  assert.equal((await ben('POST', `/api/agent-approvals/${card}/approve`)).status, 403);
  assert.ok((await owner('GET', '/api/agent-approvals')).data.approvals.some((a) => a.id === card));
  assert.ok((await owner('GET', '/api/notifications')).data.some((n) => n.type === 'agent_approval'));
  const approved = await owner('POST', `/api/agent-approvals/${card}/approve`);
  assert.equal(approved.data.approval.status, 'approved');
  assert.equal(sql.get('SELECT assignee_id FROM tasks WHERE id = ?', ids.task.id).assignee_id, ids.ana);
  assert.equal((await owner('POST', `/api/agent-approvals/${card}/approve`)).status, 409);
  const change = (await ana('GET', `/api/tasks/${ids.task.id}/detail`)).data.activity.filter((a) => a.type === 'assigneeId').at(-1);
  assert.equal(change.actorId, ids.helper);
  assert.equal(change.actingForId, sql.get("SELECT id FROM users WHERE name = 'Erik Lind'").id);
  assert.equal((await rest(keys.helper, 'GET', `/approvals/${card}`)).data.status, 'approved');

  // now that it's Ana's, taking it back or deleting it is also her call, and she can decline
  const del = await tool(keys.helper, 'delete_task', { key: k(ids.task) });
  assert.equal(del.structuredContent.status, 'pending_approval');
  assert.deepEqual(del.structuredContent.approval.reasons, ['deletes the task']);
  const declined = await ana('POST', `/api/agent-approvals/${del.structuredContent.approval.id}/decline`);
  assert.equal(declined.data.approval.status, 'declined');
  assert.equal(sql.get('SELECT deleted_at FROM tasks WHERE id = ?', ids.task.id).deleted_at, null);
  const activity = (await ana('GET', `/api/tasks/${ids.task.id}/agent-activity`)).data;
  assert.deepEqual(activity.approvals.map((a) => a.status), ['approved', 'declined']);

  const outside = await rest(keys.helper, 'POST', '/tasks', { title: 'Beta follow-up', project: 'Beta' });
  assert.equal(outside.status, 202);
  assert.deepEqual(outside.data.approval.reasons, ['puts work in a project outside its scope']);
  const ok = await owner('POST', `/api/agent-approvals/${outside.data.approval.id}/approve`);
  assert.equal(ok.data.approval.result.created.project, 'Beta');

  sql.run('DELETE FROM agent_writes');
  const made = [];
  for (const title of ['One', 'Two', 'Three', 'Four']) made.push(await rest(keys.helper, 'POST', '/tasks', { title, project: 'Alpha' }));
  assert.deepEqual(made.map((r) => r.status), [201, 201, 201, 202]);
  assert.match(made[3].data.approval.reasons[0], /more than 3 tasks within 10 minutes/);
  // touching a task already changed in the window isn't a new one
  assert.equal((await rest(keys.helper, 'PATCH', `/tasks/${made[0].data.created.key}`, { priority: 'low' })).status, 200);
});

test('an agent can only have so many requests waiting for approval', async () => {
  sql.run("UPDATE agent_approvals SET status = 'declined' WHERE status = 'pending'");
  const asks = [];
  for (let i = 0; i < 4; i++) asks.push(await rest(keys.helper, 'POST', '/tasks', { title: `Elsewhere ${i}`, project: 'Beta' }));
  assert.deepEqual(asks.map((r) => r.status), [202, 202, 202, 429]);
  assert.equal(asks[3].data.error.code, 'too_many_approvals');
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM agent_approvals WHERE agent_id = ? AND status = 'pending'", ids.helper).n, 3);
  await owner('POST', `/api/agent-approvals/${asks[0].data.approval.id}/decline`);
  assert.equal((await rest(keys.helper, 'POST', '/tasks', { title: 'Elsewhere again', project: 'Beta' })).status, 202);
});

test('read-only agents and tool allowlists are enforced', async () => {
  const listed = (await mcp(keys.reader, 'tools/list')).body.result.tools.map((t) => t.name);
  assert.ok(listed.includes('get_task') && !listed.includes('create_task'));
  const denied = await rest(keys.reader, 'POST', '/tasks', { title: 'Nope' });
  assert.equal(denied.status, 403);
  assert.equal(denied.data.error.code, 'read_only');
  assert.equal((await tool(keys.reader, 'create_task', { title: 'Nope' })).isError, true);
  // marking its own inbox read is still a change, so a read-only agent can't, and doesn't see the tool
  const marked = await rest(keys.reader, 'POST', '/me/inbox/read', { all: true });
  assert.equal(marked.status, 403);
  assert.equal(marked.data.error.code, 'read_only');
  assert.ok(!listed.includes('watch_task') && !listed.includes('mark_inbox_read'));
  assert.equal((await rest(keys.reader, 'GET', '/tasks?project=Beta')).data.count, 2);

  await owner('PATCH', `/api/agents/${ids.helper}`, { tools: ['whoami', 'get_task'] });
  const blocked = await rest(keys.helper, 'GET', '/tasks/search?query=crash');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error.code, 'tool_not_allowed');
  assert.deepEqual((await mcp(keys.helper, 'tools/list')).body.result.tools.map((t) => t.name), ['whoami', 'get_task']);
  const trail = sql.get("SELECT outcome, detail FROM agent_audit WHERE agent_id = ? AND action = 'search_tasks' ORDER BY id DESC LIMIT 1", ids.helper);
  assert.equal(trail.outcome, 'denied');
  await owner('PATCH', `/api/agents/${ids.helper}`, { tools: tools.map((t) => t.name) });
});

test('errors have one shape; keys, rate limits and arguments are checked', async () => {
  const missing = await rest(null, 'GET', '/me');
  assert.equal(missing.status, 401);
  assert.equal(missing.data.error.code, 'unauthorized');
  assert.match(missing.headers.get('www-authenticate'), /Bearer/);
  assert.match(missing.data.error.message, /Send a Nil access key/);
  const wrong = await rest('nonos_agt_wrong', 'GET', '/me');
  assert.equal(wrong.status, 401);
  assert.match(wrong.data.error.message, /That access key isn’t valid/);
  const wrongOverMcp = await mcp('nonos_agt_wrong', 'ping');
  assert.equal(wrongOverMcp.status, 401);
  assert.match(wrongOverMcp.body.error, /That access key isn’t valid/);
  const unknown = await rest(keys.helper, 'GET', '/nope');
  assert.deepEqual(Object.keys(unknown.data.error).sort(), ['code', 'message', 'status']);
  assert.equal(unknown.status, 404);
  const badArgs = await rest(keys.helper, 'GET', '/tasks?limit=many');
  assert.equal(badArgs.status, 400);
  const extra = await rest(keys.helper, 'POST', '/tasks', { title: 'x', private: true });
  assert.equal(extra.status, 400);
  assert.match(extra.data.error.message, /unknown field “private”/);
  assert.equal((await rest(keys.helper, 'POST', '/tasks', { title: '' })).data.error.code, 'invalid_arguments');
  const notFound = await rest(keys.helper, 'GET', '/tasks/NON-999');
  assert.equal(notFound.status, 404);
  assert.equal(notFound.data.error.code, 'not_found');
  const res = await fetch(`${base()}/api/agent/v1/tasks`, { method: 'POST', headers: { Authorization: `Bearer ${keys.helper}`, 'Content-Type': 'application/json' }, body: '{"title":' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'invalid_json');
  assert.equal((await rest(keys.helper, 'GET', '/me', undefined, { Origin: 'https://evil.example' })).status, 403);

  // personal access keys work here too, acting as their person
  const pat = (await ana('POST', '/api/me/tokens', { name: 'script', scope: 'read' })).data.token;
  assert.equal((await rest(pat, 'GET', '/me')).data.name, 'Ana Park');
  assert.equal((await rest(pat, 'GET', '/me')).data.kind, 'person');

  // the window already counts this minute's earlier calls, so the limit bites within a few
  await owner('PATCH', `/api/agents/${ids.helper}`, { rateLimit: 3 });
  let limited;
  for (let i = 0; i < 4 && limited?.status !== 429; i++) limited = await rest(keys.helper, 'GET', '/me');
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error.code, 'rate_limited');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(limited.headers.get('ratelimit-limit'), '3');
  assert.equal((await mcp(keys.helper, 'ping')).status, 429);
});

test('the OpenAPI document is generated from the tool list and matches it', async () => {
  const res = await fetch(`${base()}/api/agent/v1/openapi.json`);
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.openapi, '3.1.0');
  assert.equal(doc.servers[0].url, `${base()}/api/agent/v1`);
  assert.equal(doc.components.securitySchemes.bearer.scheme, 'bearer');
  const operations = Object.entries(doc.paths).flatMap(([path, ops]) => Object.entries(ops).map(([method, op]) => ({ path, method, op })));
  assert.deepEqual(operations.map((o) => o.op.operationId).sort(), tools.map((t) => t.name).sort());
  for (const t of tools) {
    const { path, method, op } = operations.find((o) => o.op.operationId === t.name);
    assert.equal(path, t.http.path);
    assert.equal(method, t.http.method.toLowerCase());
    assert.equal(op.description, t.description);
    const declared = Object.keys(t.inputSchema.properties ?? {}).sort();
    const named = [...op.parameters.filter((p) => p.name).map((p) => p.name), ...Object.keys(op.requestBody?.content['application/json'].schema.properties ?? {})].sort();
    assert.deepEqual(named, declared, `${t.name} parameters`);
    for (const required of t.inputSchema.required ?? []) {
      const param = op.parameters.find((p) => p.name === required);
      assert.ok(param?.required || op.requestBody?.content['application/json'].schema.required?.includes(required), `${t.name}.${required} required`);
    }
    assert.ok(op.responses[t.http.status ?? 200], `${t.name} success response`);
    assert.ok(op.responses['401'] && op.responses['429']);
    if (t.write) assert.ok(op.responses['202'], `${t.name} pending approval response`);
    if (method !== 'get') assert.ok(op.parameters.some((p) => p.$ref === '#/components/parameters/IdempotencyKey'));
  }
});

test('search_tasks finds every word in any order, and only tasks the agent may see', async () => {
  await owner('PATCH', `/api/agents/${ids.helper}`, { rateLimit: null });
  const faq = (await ana('POST', '/api/tasks', { title: 'Draft the FAQ for launch', projectId: ids.alpha, checklist: [{ text: 'Pricing questions' }] })).data.task;
  await ana('POST', `/api/tasks/${faq.id}/comments`, { body: 'Support keeps asking about refunds.' });
  const beta = (await ana('POST', '/api/tasks', { title: 'Launch FAQ for finance', projectId: ids.beta })).data.task;
  await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana), projectId: ids.alpha });

  // words out of order, a word from the checklist, one from a comment, prefixes
  for (const query of ['launch faq', 'FAQ for the launch', 'pricing launch', 'refunds faq', 'draf laun']) {
    const found = await both(keys.helper, 'search_tasks', { query }, 'GET', `/tasks/search?query=${encodeURIComponent(query)}`);
    assert.deepEqual(found.rest.tasks.map((t) => t.key), [k(faq)], query);
  }
  const viaComment = (await tool(keys.helper, 'search_tasks', { query: 'refunds' })).structuredContent.tasks[0];
  assert.equal(viaComment.matched, 'comment');
  assert.match(viaComment.snippet, /refunds/);

  // Beta is outside Helper's projects; an agent on all projects sees it
  assert.deepEqual((await tool(keys.reader, 'search_tasks', { query: 'launch faq' })).structuredContent.tasks.map((t) => t.key).sort(), [k(faq), k(beta)].sort());
  assert.deepEqual((await tool(keys.reader, 'search_tasks', { query: 'launch faq', project: 'Beta' })).structuredContent.tasks.map((t) => t.key), [k(beta)]);
  assert.equal((await tool(keys.reader, 'search_tasks', { query: 'launch faq', status: 'done' })).structuredContent.count, 0);
  assert.equal((await tool(keys.reader, 'search_tasks', { query: 'a' })).structuredContent.tasks.some((t) => t.private), false);
  // punctuation can't be read as search syntax
  assert.equal((await tool(keys.helper, 'search_tasks', { query: 'faq" OR title:*' })).isError, undefined);
});
