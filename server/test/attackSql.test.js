import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import agentCalls from './helpers/agentCalls.js';

// SQL injection fuzzing. Every query parameter the web app's API reads, every query and path
// parameter of the agent API (taken from its own OpenAPI document) and every id in a route path
// gets the classic payloads. None may break a query (a 500 or an SQLite message), leak a task
// the caller can't see, or change anything.
let srv;
const base = () => srv.base;
const owner = client(base);
const guest = client(base);
const { rest } = agentCalls(base);
const ids = {};
let agentKey;
let sql;

const SECRET = 'SECRETBOARDTITLE';
// small, so a few hundred differently shaped updates would overflow it
const STATEMENT_CACHE = 100;
const PAYLOADS = [
  "' OR 1=1--",
  "' OR '1'='1",
  '" OR ""="',
  "1; DROP TABLE tasks;--",
  "') UNION SELECT * FROM sessions--",
  "%' OR '%'='",
  '%',
  '_',
  '\\',
  '*',
  '"',
  'NEAR(a b)',
  'title:x OR description:y',
  '-1',
  '0',
  '1.5',
  '1e309',
  '0x10',
  '99999999999999999999999',
  `${'A'.repeat(5000)}`,
  'null',
  '\u0000',
];

// The web app's API reads these query parameters (grep req.query in server/routes).
const API_QUERIES = [
  ['/api/activity', ['limit']],
  ['/api/notifications', ['limit', 'before']],
  ['/api/search', ['q']],
  ['/api/bootstrap', ['tasks']],
  ['/api/share-links', ['kind', 'targetId'], { kind: 'project' }],
  ['/api/tasks/archive', ['before', 'cursor', 'q', 'number', 'sealed', 'bounty', 'ids', 'dueFrom', 'dueTo', 'limit'], { before: String(Date.now() + 1e9) }],
  ['/api/tasks/archive/summary', ['before', 'labels'], { before: String(Date.now() + 1e9), labels: '1' }],
  ['/api/time', ['from', 'to']],
  ['/api/time/export.csv', ['from', 'to']],
  ['/api/plan/quote', ['kind', 'periods', 'people']],
];

// Collects every problem, so one run lists them all instead of stopping at the first.
const problems = [];
const clean = (res, what) => {
  const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  if (res.status === 500) problems.push(`${what} answered 500`);
  if (/sqlite|syntax error|no such (column|table)|SQLITE_/i.test(text)) problems.push(`${what} leaked a database error: ${text.slice(0, 120)}`);
  if (text.includes(SECRET)) problems.push(`${what} leaked a task the caller can't see`);
};
const noProblems = () => assert.deepEqual(problems.splice(0), []);

const counts = () => ({
  tasks: sql.get('SELECT COUNT(*) AS n FROM tasks').n,
  users: sql.get('SELECT COUNT(*) AS n FROM users').n,
  sessions: sql.get('SELECT COUNT(*) AS n FROM sessions').n,
});

before(async () => {
  srv = await startServer({ env: { DB_STATEMENT_CACHE: String(STATEMENT_CACHE) } });
  sql = (await import('../db/sql.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
  ids.shared = (await owner('POST', '/api/projects', { name: 'Shared' })).data.project.id;
  ids.board = (await owner('POST', '/api/projects', { name: 'Board' })).data.project.id;
  const inv = await owner('POST', '/api/invites', { role: 'guest', projectIds: [ids.shared] });
  await guest.wallet(wallet(), 'invite', { name: 'Gus Guest', inviteToken: inv.data.token });
  ids.open = (await owner('POST', '/api/tasks', { title: 'Shared work item', projectId: ids.shared })).data.task.id;
  ids.secret = (await owner('POST', '/api/tasks', { title: `${SECRET} merger`, description: 'board only', projectId: ids.board })).data.task.id;
  // an archived one too, so archive queries have rows on both sides of the line
  const done = (await owner('POST', '/api/tasks', { title: `${SECRET} archived`, projectId: ids.board })).data.task.id;
  await owner('PATCH', `/api/tasks/${done}`, { status: 'done' });
  const agent = await owner('POST', '/api/agents', { name: 'Scout', color: '#7c4ddb', access: 'write', projectIds: [ids.shared], runner: 'external' });
  agentKey = agent.data.key;
  ids.agent = agent.data.agent.id;
});
after(() => srv.close());

test('every web API query parameter survives injection payloads as a guest', async () => {
  const before = counts();
  let calls = 0;
  for (const [path, params, fixed = {}] of API_QUERIES) {
    for (const name of params) {
      for (const payload of PAYLOADS) {
        const query = new URLSearchParams({ ...fixed, [name]: payload });
        clean(await guest('GET', `${path}?${query}`), `GET ${path}?${name}=${payload.slice(0, 30)}`);
        calls++;
      }
      // qs turns brackets into arrays and objects, which handlers must not trip over
      for (const shape of [`${name}[]=1&${name}[]=2`, `${name}[a]=b`, `${name}[__proto__][x]=1`]) {
        clean(await guest('GET', `${path}?${new URLSearchParams(fixed)}&${shape}`), `GET ${path}?${shape}`);
        calls++;
      }
    }
  }
  noProblems();
  assert.deepEqual(counts(), before, 'nothing changed');
  assert.ok(calls > 600, `ran ${calls} requests`);
});

test('admin-only query parameters survive injection payloads too', async () => {
  for (const [path, params] of [[`/api/agents/${ids.agent}/audit`, ['before', 'limit']], ['/api/plan/quote', ['kind', 'periods', 'people']]]) {
    for (const name of params) {
      for (const payload of PAYLOADS) {
        const res = await owner('GET', `${path}?${new URLSearchParams({ [name]: payload })}`);
        if (res.status === 500) problems.push(`GET ${path}?${name}=${payload.slice(0, 30)} answered 500`);
      }
    }
  }
  noProblems();
});

test('negative or fractional page sizes don’t lift the caps', async () => {
  for (const path of ['/api/activity', '/api/notifications']) {
    for (const limit of ['-1', '-100', '0.5', '1e3']) {
      const res = await owner('GET', `${path}?limit=${limit}`);
      assert.equal(res.status, 200, `${path}?limit=${limit} answered ${res.status}`);
      assert.ok(res.data.length <= 300, `${path}?limit=${limit} returned ${res.data.length} rows`);
    }
  }
  // enough activity that an unlimited query returns more than the cap
  for (let i = 0; i < 160; i++) await owner('PATCH', `/api/tasks/${ids.open}`, { priority: (i % 4) + 1 });
  const unlimited = await owner('GET', '/api/activity?limit=-1');
  assert.ok(unlimited.data.length <= 300, `limit=-1 returned ${unlimited.data.length} activity rows`);
  const capped = await owner('GET', '/api/activity?limit=1000');
  assert.ok(unlimited.data.length <= capped.data.length);
});

test('every agent API parameter survives injection payloads', async () => {
  const before = counts();
  const doc = (await rest(null, 'GET', '/openapi.json')).data;
  let calls = 0;
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      for (const param of op.parameters.filter((p) => p.in)) {
        for (const payload of PAYLOADS) {
          const filled = path.replace(/\{(\w+)\}/g, (m, name) => (name === param.name ? encodeURIComponent(payload) : 'NIL-1'));
          const query = param.in === 'query' ? `?${new URLSearchParams({ [param.name]: payload })}` : '';
          // writes go to a read path only through their path parameter, so nothing is created
          if (method !== 'get' && param.in !== 'path') continue;
          const res = await rest(agentKey, method.toUpperCase(), `${filled}${query}`, method === 'get' ? undefined : {});
          clean(res, `${method.toUpperCase()} ${path} ${param.name}=${payload.slice(0, 30)}`);
          calls++;
        }
      }
    }
  }
  // JSON fields of the search-like tools as well
  for (const payload of PAYLOADS) {
    clean(await rest(agentKey, 'GET', `/tasks?${new URLSearchParams({ search: payload.slice(0, 200), assignee: payload.slice(0, 200), project: payload.slice(0, 200) })}`), `list_tasks ${payload.slice(0, 20)}`);
    calls++;
  }
  noProblems();
  assert.deepEqual(counts(), before, 'nothing changed');
  assert.ok(calls > 100, `ran ${calls} requests`);
});

test('every id in a web API path survives injection payloads', async () => {
  const before = counts();
  const { default: createApp } = await import('../app.js');
  const routes = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) for (const method of Object.keys(layer.route.methods)) routes.push([method.toUpperCase(), prefix + layer.route.path]);
      else if (layer.handle?.stack) walk(layer.handle.stack, prefix + (layer.regexp.fast_slash ? '' : (layer.regexp.source.match(/^\^\\\/(\w+)/)?.[1] ? `/${layer.regexp.source.match(/^\^\\\/(\w+)/)[1]}` : '')));
    }
  };
  walk(createApp()._router.stack, '');
  const reads = routes.filter(([method, path]) => method === 'GET' && path.startsWith('/api/') && path.includes('/:'));
  assert.ok(reads.length > 10, `found ${reads.length} GET routes with path ids`);
  let calls = 0;
  for (const [, path] of reads) {
    for (const payload of PAYLOADS) {
      const filled = path.replace(/:(\w+)/g, () => encodeURIComponent(payload));
      clean(await guest('GET', filled), `GET ${path} with ${payload.slice(0, 30)}`);
      calls++;
    }
  }
  noProblems();
  assert.deepEqual(counts(), before, 'nothing changed');
  assert.ok(calls > 200, `ran ${calls} requests`);
});

test('changing tasks with fields in every order doesn’t grow the statement cache without end', async () => {
  const keys = ['priority', 'estimate', 'dueDate', 'startDate', 'status', 'description', 'title'];
  const orders = new Set();
  // shuffled field orders and subsets, each with a changed value so the UPDATE really runs
  let seed = 7;
  const random = (below) => Math.floor(((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * below);
  for (let n = 0; n < 400; n++) {
    const order = [...keys];
    for (let i = order.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const picked = order.slice(0, 2 + random(6));
    orders.add(picked.join());
    const day = String((n % 28) + 1).padStart(2, '0');
    const value = { priority: (n % 4) + 1, estimate: n + 1, dueDate: `2031-02-${day}`, startDate: `2030-02-${day}`, status: n % 2 ? 'todo' : 'in_progress', description: `v${n}`, title: `Shared work item ${n}`, labels: [] };
    const body = Object.fromEntries(picked.map((k) => [k, value[k]]));
    const res = await owner('PATCH', `/api/tasks/${ids.open}`, body);
    assert.equal(res.status, 200, JSON.stringify(res.data));
  }
  assert.ok(orders.size > STATEMENT_CACHE, `sent ${orders.size} differently shaped updates`);
  assert.equal(typeof sql.cachedStatements, 'number');
  assert.ok(sql.cachedStatements <= STATEMENT_CACHE, `the cache holds ${sql.cachedStatements} statements`);
});
