import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import WebSocket from 'ws';
import startServer from './helpers/startServer.js';
import authzWorld from './helpers/authzWorld.js';
import authzTargets from './helpers/authzTargets.js';
import authzRequest from './helpers/authzRequest.js';
import authzResolve from './helpers/authzResolve.js';
import authzExpect from './helpers/authzExpect.js';
import actors from './helpers/authzActors.js';
import listRoutes from './helpers/listRoutes.js';
import sealed from './helpers/sealed.js';
import rowsOpen from './helpers/authzRowsOpen.js';
import rowsWork from './helpers/authzRowsWork.js';
import rowsTeam from './helpers/authzRowsTeam.js';
import rowsPools from './helpers/authzRowsPools.js';
import rowsAgentApi from './helpers/authzRowsAgentApi.js';
import rowsEdge from './helpers/authzRowsEdge.js';

// The authorization matrix: every route the server answers, called as every kind of caller, with
// what each one may and may not do written down per route. Routes are found by walking the
// routers, so a route added without a row here fails the first test, and a row whose route is
// gone fails it too.
const API = { ...rowsOpen, ...rowsWork, ...rowsTeam, ...rowsPools };
const ROWS = { ...API, ...rowsAgentApi, ...rowsEdge };
const PEOPLE = new Set(actors.PEOPLE);

let srv;
let web;
let ctx;
let tools;
let cells = 0;

function statusFits(status, statuses) {
  return statuses === '2xx' ? status >= 200 && status < 300 : statuses.includes(status);
}

// Runs one row for every actor and returns what didn't match, so one run lists every miss.
async function runRow(key, row, { bearer = false } = {}) {
  const [method, routePath] = key.split(' ');
  const misses = [];
  const shared = new Map();
  for (const actor of actors.ALL) {
    const expected = authzExpect(row, actor, { bearer });
    const sent = await authzResolve(routePath, row, ctx, actor, { allowed: expected.allowed, shared });
    const cookie = row.session === 'fresh' && expected.allowed && ctx.world.people[actor] ? await ctx.world.freshCookie(actor) : undefined;
    const res = await authzRequest(ctx.world, actor, { method, bearer, cookie, ...sent });
    cells += 1;
    if (!statusFits(res.status, expected.statuses)) misses.push(`${key} as ${actor}: got ${res.status}, expected ${expected.allowed ? 'allowed' : 'refused'} ${expected.statuses} ${JSON.stringify(res.data).slice(0, 160)}`);
    // People can never reach the bearer-key endpoints with their browser cookie alone.
    if (bearer && !row.open && PEOPLE.has(actor)) {
      const cookieOnly = await authzRequest(ctx.world, actor, { method, ...sent });
      cells += 1;
      if (cookieOnly.status !== 401) misses.push(`${key} as ${actor} with a cookie and no key: got ${cookieOnly.status}, expected 401`);
    }
  }
  return misses;
}

before(async () => {
  srv = await startServer({ env: { TRUST_PROXY: 'loopback' } });
  const world = await authzWorld(() => srv.base);
  ctx = { world, t: await authzTargets(world) };
  tools = (await import('../mcp/tools.js')).default;
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Nil</title>');
  fs.writeFileSync(path.join(dist, 'sw.js'), '');
  const { default: serveWebApp } = await import('../lib/serveWebApp.js');
  const app = express();
  serveWebApp(app, dist);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  web = { app, base: `http://127.0.0.1:${server.address().port}`, close: () => (server.close(), fs.rmSync(dist, { recursive: true, force: true })) };
});
after(() => {
  web?.close();
  srv.close();
});

test('every route the server answers has a row in the matrix, and every row a route', async () => {
  const { default: createApp } = await import('../app.js');
  const found = new Set([...listRoutes(createApp()), ...listRoutes(web.app), 'WS /ws', ...tools.map((tool) => `MCP ${tool.name}`)]);
  const rows = new Set([...Object.keys(ROWS), ...tools.map((tool) => `MCP ${tool.name}`)]);
  assert.deepEqual([...found].filter((k) => !rows.has(k)), [], 'routes with no row in the authorization matrix');
  assert.deepEqual([...rows].filter((k) => !found.has(k) && !ROWS[k]?.optional), [], 'rows for routes that no longer exist');
  assert.ok(![...found].some((k) => k.includes('?')), 'a mount path the route walker couldn’t read');
});

test('the JSON API: every route, every caller', async () => {
  const misses = [];
  for (const [key, row] of Object.entries(API).filter(([, r]) => !r.last)) misses.push(...(await runRow(key, row)));
  assert.deepEqual(misses, []);
});

test('the agent REST API: every route, every caller, by key only', async () => {
  const misses = [];
  for (const [key, row] of Object.entries(rowsAgentApi)) misses.push(...(await runRow(key, row, { bearer: true })));
  assert.deepEqual(misses, []);
});

test('health, discovery and the web app’s pages answer everyone alike', async () => {
  const misses = [];
  for (const [key, row] of Object.entries(rowsEdge).filter(([k]) => k.startsWith('GET '))) {
    for (const actor of actors.ALL) {
      const url = row.path ?? key.split(' ')[1];
      const res = await authzRequest({ ...ctx.world, base: () => (row.web && url !== '/' ? web.base : srv.base) }, actor, { method: 'GET', url });
      cells += 1;
      if (res.status !== 200) misses.push(`${key} as ${actor}: got ${res.status}`);
    }
  }
  assert.deepEqual(misses, []);
});

// One MCP JSON-RPC call as an actor, with the actor's key.
const mcp = (actor, method, params) => authzRequest(ctx.world, actor, { method: 'POST', url: '/mcp', bearer: true, body: { jsonrpc: '2.0', id: 1, method, params } });

test('MCP: the endpoint and every tool, every caller, each matching its REST twin', async () => {
  const misses = [];
  for (const actor of actors.ALL) {
    const expected = authzExpect(rowsEdge['POST /mcp'], actor, { bearer: true });
    const init = await mcp(actor, 'initialize', { protocolVersion: '2025-06-18' });
    const get = await authzRequest(ctx.world, actor, { method: 'GET', url: '/mcp', bearer: true });
    cells += 2;
    if (init.status !== (expected.allowed ? 200 : 401) || get.status !== (expected.allowed ? 405 : 401)) misses.push(`/mcp as ${actor}: POST ${init.status}, GET ${get.status}`);
  }
  for (const tool of tools) {
    const routePath = `/api/agent/v1${tool.http.path.replace(/\{(\w+)\}/g, ':$1')}`;
    const row = rowsAgentApi[`${tool.http.method} ${routePath}`];
    for (const actor of actors.ALL) {
      const expected = authzExpect(row, actor, { bearer: true });
      const sent = await authzResolve(routePath, row, ctx, actor, { allowed: expected.allowed });
      const url = new URL(sent.url, 'http://x');
      const params = {};
      routePath.split('/').forEach((part, i) => part.startsWith(':') && (params[part.slice(1)] = decodeURIComponent(url.pathname.split('/')[i])));
      const res = await mcp(actor, 'tools/call', { name: tool.name, arguments: { ...sent.body, ...Object.fromEntries(url.searchParams), ...params } });
      cells += 1;
      const failed = Boolean(res.data?.result?.isError);
      const okStatuses = expected.statuses === '2xx' ? [200] : expected.statuses;
      const fits = expected.statuses.includes?.(401)
        ? res.status === 401
        : res.status === 200 && (expected.allowed ? (okStatuses.some((s) => s < 300) && !failed) || (okStatuses.some((s) => s >= 400) && failed) : failed);
      if (!fits) misses.push(`MCP ${tool.name} as ${actor}: HTTP ${res.status}, ${JSON.stringify(res.data).slice(0, 160)}`);
    }
  }
  assert.deepEqual(misses, []);
});

test('the live connection opens for people only, never for a key or a stale cookie', async () => {
  const misses = [];
  for (const actor of actors.ALL) {
    const headers = actor.startsWith('agent') ? { Authorization: `Bearer ${ctx.world.keys[actor]}` } : ctx.world.cookieOf(actor) ? { Cookie: ctx.world.cookieOf(actor) } : {};
    const ws = new WebSocket(`${srv.base.replace('http', 'ws')}/ws`, { headers });
    const outcome = await new Promise((resolve) => {
      ws.on('open', () => resolve(101));
      ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
      ws.on('error', () => resolve('error'));
    });
    ws.terminate();
    cells += 1;
    if (outcome !== (rowsEdge['WS /ws'].allow.includes(actor) ? 101 : 401)) misses.push(`WS /ws as ${actor}: ${outcome}`);
  }
  assert.deepEqual(misses, []);
});

test('nothing a guest, an agent or a signed-out caller can read names a task they can’t open', async () => {
  const { t, world } = ctx;
  // the most recently changed task, so it heads every list that pages
  await world.people.owner('PATCH', `/api/tasks/${t.boardTask}`, { priority: 3 });
  const found = await authzRequest(world, 'member', { method: 'GET', url: `/api/search?q=${encodeURIComponent(t.canary)}` });
  assert.ok(JSON.stringify(found.data).includes(t.canary), 'the member can find the board task, so the check below means something');
  const leaks = [];
  const reads = [...Object.entries(API).map((e) => [...e, false]), ...Object.entries(rowsAgentApi).map((e) => [...e, true])].filter(([key]) => key.startsWith('GET '));
  for (const [key, row, bearer] of reads) {
    for (const actor of ['anon', 'stranger', 'outsider', 'guest', 'agentRead', 'agentWrite']) {
      const sent = await authzResolve(key.slice(4), row, ctx, actor, { allowed: authzExpect(row, actor, { bearer }).allowed });
      const res = await authzRequest(world, actor, { method: 'GET', bearer, ...sent });
      if ((typeof res.data === 'string' ? res.data : JSON.stringify(res.data)).includes(t.canary)) leaks.push(`${key} as ${actor}`);
    }
  }
  // and asking for it by name gets nothing either
  const boardKey = `${t.prefix}-${(await world.people.owner('GET', `/api/tasks/${t.boardTask}/detail`)).data.task.number}`;
  for (const actor of ['guest', 'agentRead', 'agentWrite']) {
    const detail = await authzRequest(world, actor, { method: 'GET', url: `/api/tasks/${t.boardTask}/detail` });
    const rest = await authzRequest(world, actor, { method: 'GET', url: `/api/agent/v1/tasks/${boardKey}`, bearer: true });
    const tool = await mcp(actor, 'tools/call', { name: 'get_task', arguments: { key: boardKey } });
    if (JSON.stringify([detail.data, rest.data, tool.data]).includes(t.canary) || rest.status !== 404) leaks.push(`the board task by name as ${actor}`);
  }
  assert.deepEqual(leaks, []);
});

test('routes that act on your own things never reach someone else’s', async () => {
  const { t, world } = ctx;
  const { owner } = world.people;
  const own = t.fresh.own;
  const checks = [
    ['DELETE', '/api/time/:id', await own.time('owner'), async (id) => (await owner('GET', '/api/time')).data.entries.some((e) => e.id === id)],
    ['DELETE', '/api/reminders/:id', await own.reminder('owner'), async (id) => (await owner('GET', '/api/reminders')).data.some((r) => r.id === id)],
    ['DELETE', '/api/me/tokens/:id', await own.token('owner'), async (id) => (await owner('GET', '/api/me/tokens')).data.some((k) => k.id === id)],
    ['DELETE', '/api/me/credentials/:id', await own.credential('owner'), async (id) => (await owner('GET', '/api/me/credentials')).data.credentials.some((c) => c.id === id)],
    ['PATCH', '/api/me/credentials/:id', await own.mainCredential('owner'), async (id) => (await owner('GET', '/api/me/credentials')).data.credentials.find((c) => c.id === id).label !== 'Taken'],
    ['DELETE', '/api/me/passkeys/:id', await own.passkey('owner'), async (id) => (await owner('GET', '/api/bootstrap')).data.passkeys.some((p) => p.id === id)],
    ['PATCH', '/api/me/passkeys/:id', await own.passkey('owner'), async (id) => (await owner('GET', '/api/bootstrap')).data.passkeys.find((p) => p.id === id).label !== 'Taken'],
    ['POST', '/api/me/passkeys/:id/used', await own.passkey('owner'), async (id) => (await owner('GET', '/api/bootstrap')).data.passkeys.find((p) => p.id === id).lastUsedAt === null],
  ];
  for (const [method, routePath, id, stillThere] of checks) {
    for (const actor of ['guest', 'member', 'admin']) await authzRequest(world, actor, { method, url: routePath.replace(':id', id), body: method === 'PATCH' ? { label: 'Taken' } : undefined });
    assert.ok(await stillThere(id), `${method} ${routePath} reached the owner’s ${id}`);
  }
});

test('the list of a task’s share links is only for people who can open the task', async () => {
  const { owner, member } = ctx.world.people;
  const task = (await owner('POST', '/api/tasks', { title: 'Shared for now', projectId: ctx.world.ids.shared })).data.task.id;
  assert.equal((await owner('POST', '/api/share-links', { kind: 'task', targetId: task })).status, 200);
  assert.equal((await member('GET', `/api/share-links?kind=task&targetId=${task}`)).data.length, 1);
  assert.equal((await owner('PATCH', `/api/tasks/${task}`, { private: true, sealed: sealed(ctx.world.ids.owner) })).status, 200);
  const listed = await member('GET', `/api/share-links?kind=task&targetId=${task}`);
  assert.equal(listed.status, 404, 'a private task’s links, and so the task, stay hidden from others');
  assert.equal((await owner('GET', `/api/share-links?kind=task&targetId=${task}`)).data.length, 1);
});

test('routes that end the session they’re called with', async (t) => {
  const misses = [];
  for (const [key, row] of Object.entries(API).filter(([, r]) => r.last)) misses.push(...(await runRow(key, row)));
  assert.deepEqual(misses, []);
  const rows = Object.keys(ROWS).length + tools.length;
  t.diagnostic(`authorization matrix: ${rows} routes x ${actors.ALL.length} callers = ${rows * actors.ALL.length} cells; ${cells} calls checked`);
});
