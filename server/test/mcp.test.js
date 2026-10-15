import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const keys = {};
let nextId = 1;

before(async () => {
  srv = await startServer();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallet(), 'invite', { name: 'Ana', inviteToken: inv.data.token });
});
after(() => srv.close());

async function rpc(key, method, params, extra = {}) {
  const res = await fetch(`${base()}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const callTool = async (key, name, args = {}) => (await rpc(key, 'tools/call', { name, arguments: args })).body.result;

test('personal access keys are shown once and stored only as a hash', async () => {
  const read = await owner('POST', '/api/me/tokens', { name: 'Claude (read)', scope: 'read' });
  assert.match(read.data.token, /^nonos_pat_[\w-]{43}$/);
  keys.read = read.data.token;
  keys.write = (await owner('POST', '/api/me/tokens', { name: 'Claude Code', scope: 'write', days: 30 })).data.token;
  keys.ana = (await ana('POST', '/api/me/tokens', { name: 'Ana bot', scope: 'write' })).data.token;
  const listed = await owner('GET', '/api/me/tokens');
  assert.equal(listed.data.length, 2);
  assert.equal(JSON.stringify(listed.data).includes('nonos_pat_'), false);
  assert.equal((await ana('GET', '/api/me/tokens')).data.length, 1);
  const { default: sql } = await import('../db/sql.js');
  assert.equal(JSON.stringify(sql.all('SELECT * FROM api_tokens')).includes(keys.read), false);
});

test('the endpoint wants a key, ignores cookies and refuses foreign origins', async () => {
  assert.equal((await rpc(null, 'ping')).status, 401);
  const withCookie = await fetch(`${base()}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: owner.cookie() }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
  assert.equal(withCookie.status, 401);
  assert.equal((await rpc(keys.read, 'ping', undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetch(`${base()}/mcp`, { headers: { Authorization: `Bearer ${keys.read}` } })).status, 405);
});

test('handshake: version negotiation, notifications and the tool list', async () => {
  const init = await rpc(keys.read, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.equal(init.body.result.serverInfo.name, 'nonos');
  assert.match(init.body.result.instructions, /read-only/);
  assert.equal((await rpc(keys.read, 'initialize', { protocolVersion: '1999-01-01' })).body.result.protocolVersion, '2025-11-25');
  const note = await fetch(`${base()}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.read}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(note.status, 202);
  const list = (await rpc(keys.read, 'tools/list')).body.result.tools;
  assert.deepEqual(list.map((t) => t.name).sort(), ['add_comment', 'create_task', 'get_task', 'list_projects', 'list_tasks', 'update_task', 'whoami', 'workspace_summary']);
  assert.equal(list.find((t) => t.name === 'create_task').annotations.readOnlyHint, false);
  assert.equal(list.find((t) => t.name === 'list_tasks').annotations.readOnlyHint, true);
  assert.equal((await rpc(keys.read, 'tools/call', { name: 'nope' })).body.error.code, -32602);
  assert.equal((await rpc(keys.read, 'resources/list')).body.error.code, -32601);
  const batch = await fetch(`${base()}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.read}` }, body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]) });
  assert.equal(batch.status, 400);
});

test('an assistant can read, create, update and comment, within the key’s scope', async () => {
  assert.equal((await callTool(keys.read, 'whoami')).structuredContent.taskPrefix, 'NON');
  const denied = await callTool(keys.read, 'create_task', { title: 'Nope' });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /read-only/);

  const created = (await callTool(keys.write, 'create_task', { title: 'Draft the launch post', assignee: 'Ana', priority: 'high', dueDate: '2026-11-01' })).structuredContent.created;
  assert.equal(created.assignee, 'Ana');
  assert.equal(created.priority, 'high');
  assert.equal((await callTool(keys.write, 'create_task', { title: 'Bad', assignee: 'Nobody Real' })).isError, true);

  const updated = (await callTool(keys.write, 'update_task', { key: created.key, status: 'in_progress', assignee: 'me' })).structuredContent.updated;
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.assignee, 'Erik Lind');
  await callTool(keys.write, 'add_comment', { key: created.key, text: 'Outline is in the doc, @Ana please review' });
  const read = (await callTool(keys.read, 'get_task', { key: created.key })).structuredContent;
  assert.equal(read.comments[0].text, 'Outline is in the doc, @Ana please review');
  assert.ok((await ana('GET', '/api/notifications')).data.some((n) => n.type === 'mention'));

  const open = (await callTool(keys.read, 'list_tasks', { status: 'open', assignee: 'me' })).structuredContent;
  assert.ok(open.tasks.some((t) => t.key === created.key));
  assert.equal((await callTool(keys.read, 'workspace_summary')).structuredContent.inProgress, 1);
});

test('private tasks stay private from other people’s assistants', async () => {
  const secret = (await callTool(keys.ana, 'create_task', { title: 'Interview at another company', private: true })).structuredContent.created;
  assert.equal((await callTool(keys.read, 'list_tasks', { search: 'Interview' })).structuredContent.count, 0);
  const peek = await callTool(keys.read, 'get_task', { key: secret.key });
  assert.equal(peek.isError, true);
  assert.equal((await callTool(keys.ana, 'get_task', { key: secret.key })).structuredContent.title, 'Interview at another company');
});

test('revoked keys, expired keys and removed people stop working at once', async () => {
  const { default: sql } = await import('../db/sql.js');
  const mine = (await owner('GET', '/api/me/tokens')).data;
  await owner('DELETE', `/api/me/tokens/${mine.find((t) => t.name === 'Claude (read)').id}`);
  assert.equal((await rpc(keys.read, 'ping')).status, 401);
  sql.run("UPDATE api_tokens SET expires_at = ? WHERE name = 'Claude Code'", Date.now() - 1000);
  assert.equal((await rpc(keys.write, 'ping')).status, 401);
  const anaId = (await ana('GET', '/api/bootstrap')).data.me.id;
  await owner('PATCH', `/api/users/${anaId}`, { deactivated: true });
  assert.equal((await rpc(keys.ana, 'ping')).status, 401);
});
