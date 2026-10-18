import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = 10n ** 18n;
let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const visitor = client(base);
const ids = {};

// Every route that belongs to the crypto tools, with a body where one is needed.
const CRYPTO_ROUTES = [
  ['GET', '/api/bounties'],
  ['PUT', '/api/bounties/treasury', { addresses: [] }],
  ['POST', '/api/payments/abc/check'],
  ['GET', '/api/proposals'],
  ['POST', '/api/proposals', { title: 'Lunch', options: ['Pizza', 'Salad'] }],
  ['GET', '/api/vote-power'],
  ['GET', '/api/proofs/mine'],
  ['GET', '/api/stealth/payouts'],
  ['PUT', '/api/me/stealth', { meta: 'x' }],
  ['GET', '/api/holder-gate'],
  ['POST', '/api/applications/abc/accept'],
];

before(async () => {
  srv = await startServer({ chain });
  const made = await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'Bakery', cryptoTools: false });
  ids.owner = made.data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: inv.data.token })).data.user.id;
  ids.task = (await owner('POST', '/api/tasks', { title: 'Order flour' })).data.task.id;
});
after(() => srv.close());

test('an everyday team starts with the crypto tools off', async () => {
  const state = (await visitor('GET', '/api/auth/state')).data;
  assert.equal(state.workspace.cryptoTools, false);
  assert.equal(state.holderGate, null);
  assert.equal((await owner('GET', '/api/bootstrap')).data.workspace.cryptoTools, false);
});

test('with the tools off their routes answer 404, signed in or not', async () => {
  for (const [method, url, body] of [...CRYPTO_ROUTES, ['GET', `/api/tasks/${ids.task}/applications`], ['POST', `/api/tasks/${ids.task}/payments`, { txHash: '0x1' }]]) {
    assert.equal((await owner(method, url, body)).status, 404, `${method} ${url}`);
  }
  assert.equal((await visitor('GET', '/api/public/bounties')).status, 404);
  assert.equal((await visitor('POST', '/api/anonymous-ballots/abc', {})).status, 404);
  assert.equal((await fetch(`${base()}/.well-known/nonos-bounties.json`)).status, 404);
  assert.equal((await fetch(`${base()}/.well-known/nonos-proof-key`)).status, 404);
  assert.equal((await visitor.wallet(wallet(), 'holder', { name: 'Whale' })).status, 403);
});

test('billing, encryption keys and everyday work keep working', async () => {
  assert.equal((await owner('GET', '/api/plan')).status, 200);
  assert.equal((await member('GET', '/api/proofs/key')).status, 200);
  // the voting key also sends AI requests anonymously, which has nothing to do with the chain
  assert.equal((await member('PUT', '/api/me/semaphore', { commitment: 'not a key' })).status, 400);
  assert.equal((await member('POST', '/api/tasks', { title: 'Bake sourdough' })).status, 200);
  assert.equal((await owner('GET', '/api/search?q=flour')).status, 200);
});

test('a bounty can’t be put on a task while the tools are off', async () => {
  assert.equal((await owner('POST', '/api/tasks', { title: 'Paid task', bounty: (5n * NOX).toString() })).status, 400);
  const res = await owner('PATCH', `/api/tasks/${ids.task}`, { bounty: (5n * NOX).toString() });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /turned off/);
  assert.equal((await owner('PATCH', `/api/tasks/${ids.task}`, { listed: true })).status, 400);
});

test('only admins switch the tools, and the change applies at once', async () => {
  assert.equal((await member('PATCH', '/api/workspace', { cryptoTools: true })).status, 403);
  assert.equal((await owner('PATCH', '/api/workspace', { cryptoTools: 'yes' })).status, 400);
  const on = await owner('PATCH', '/api/workspace', { cryptoTools: true });
  assert.equal(on.status, 200);
  assert.equal(on.data.workspace.cryptoTools, true);
  assert.equal((await owner('GET', '/api/bounties')).status, 200);
  assert.equal((await owner('GET', '/api/proposals')).status, 200);
  assert.equal((await owner('GET', '/api/proofs/mine')).status, 200);
  assert.equal((await fetch(`${base()}/.well-known/nonos-proof-key`)).status, 200);

  // the holder door works while the tools are on and closes with them
  assert.equal((await owner('PUT', '/api/holder-gate', { enabled: true, minimum: (100n * NOX).toString() })).data.enabled, true);
  assert.ok((await visitor('GET', '/api/auth/state')).data.holderGate);
  const bounty = await owner('PATCH', `/api/tasks/${ids.task}`, { bounty: (5n * NOX).toString() });
  assert.equal(bounty.status, 200);

  await owner('PATCH', '/api/workspace', { cryptoTools: false });
  assert.equal((await visitor('GET', '/api/auth/state')).data.holderGate, null);
  const holder = wallet();
  chain.setBalance(holder.address, 500n * NOX);
  assert.equal((await client(base).wallet(holder, 'holder', { name: 'Whale' })).status, 403);
  // a bounty set earlier can still be taken off
  assert.equal((await owner('PATCH', `/api/tasks/${ids.task}`, { bounty: null })).status, 200);
});

test('a workspace that existed before the switch keeps its crypto tools', async () => {
  const { default: migrations } = await import('../db/migrations.js');
  const { default: everydayTeams } = await import('../db/migrations/022-everyday-teams.js');
  const db = new DatabaseSync(':memory:');
  const at = migrations.indexOf(everydayTeams);
  for (const [i, step] of migrations.entries()) {
    if (i === at) db.exec("INSERT INTO workspace (id, name, created_at) VALUES (1, 'Old team', 0)");
    db.exec(typeof step === 'string' ? step : step.sql);
  }
  assert.equal(db.prepare('SELECT crypto_tools FROM workspace').get().crypto_tools, 1);
  db.close();
});
