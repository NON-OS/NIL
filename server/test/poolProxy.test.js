import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import poolChain from './helpers/poolChain.js';
import fakePoolServices from './helpers/fakePoolServices.js';
import poolAbi from '../pools/poolAbi.js';

// The narrow routes browsers use instead of talking to Privacy Pools services themselves: what
// they forward, where, and what they refuse; plus the team's sealed pool account.
const ENTRYPOINT = '0x6818809eefce719e480a7526d76bd3e561526b46';
const POOL = '0xb419c2867ab3cbc78921660cb95150d95a94ce86';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const DEPOSIT = JSON.parse(fs.readFileSync(new URL('./fixtures/sepoliaPoolDeposit.json', import.meta.url)));
const SEPOLIA_POOL = '0x0b062fe33c4f1592d8ea63f9a0177fca44374c0f';
const pad = (n) => BigInt(n).toString(16).padStart(64, '0');
const tag = 'a'.repeat(32);

let srv;
let services;
let pools;
let poolFetch;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ada = client(base);
const mia = client(base);
const ids = {};

before(async () => {
  services = await fakePoolServices();
  srv = await startServer({ chain, env: { PRIVACY_POOLS: 'on', PRIVACY_POOLS_RELAYER_URL: services.url, PRIVACY_POOLS_ASP_URL: services.url, PRIVACY_POOLS_SETS_CACHE_SECONDS: '5' } });
  pools = poolChain(chain, { entrypoint: ENTRYPOINT, pool: POOL, token: USDC });
  poolFetch = (await import('../pools/poolFetch.js')).default;
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [who, name, role] of [[ada, 'Ada', 'admin'], [mia, 'Mia', 'member']]) {
    const inv = await owner('POST', '/api/invites', { role });
    ids[name] = (await who.wallet(wallet(), 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => {
  services.close();
  srv.close();
});

test('the proxy calls only the configured hosts, on fixed paths, and refuses redirects and floods', async () => {
  await assert.rejects(poolFetch('relayer', '/relayer/details'), /refused/);
  await assert.rejects(poolFetch('asp', '/1/public/../../admin'), /refused/);
  await assert.rejects(poolFetch('asp', '//169.254.169.254/latest'), /refused/);
  await assert.rejects(poolFetch('rpc', '/relayer/quote'), /refused/);
  await assert.rejects(poolFetch('asp', '/1/public/mt-leaves', { headers: { 'X-Pool-Scope': '1\r\nX-Evil: 1' } }), /malformed/);
  const before = services.requests.length;
  assert.equal(services.requests.length, before);

  services.state.redirect = 'http://169.254.169.254/latest/meta-data';
  await assert.rejects(poolFetch('asp', '/1/public/mt-roots'), /couldn’t reach/);
  services.state.redirect = null;
  services.state.huge = true;
  await assert.rejects(poolFetch('asp', '/1/public/mt-leaves'), /couldn’t reach/);
  services.state.huge = false;
  const ok = await poolFetch('asp', '/1/public/mt-leaves', { headers: { 'X-Pool-Scope': '7' } });
  assert.equal(ok.ok, true);
  assert.equal(services.requests.at(-1).headers['x-pool-scope'], '7');
});

test('members never see the pool routes; admins get the pools the entry contract lists', async () => {
  for (const [method, url] of [['GET', '/api/pools'], ['GET', '/api/pools/USDC/sets'], ['GET', '/api/pool-account'], ['POST', '/api/pools/USDC/events']]) {
    assert.equal((await mia(method, url, method === 'POST' ? {} : undefined)).status, 403, url);
  }
  chain.answer(ENTRYPOINT, `0x${poolAbi.assetConfig}${pad('0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca')}`, `0x${'0'.repeat(256)}`);
  const res = await owner('GET', '/api/pools');
  assert.equal(res.status, 200);
  const usdc = res.data.assets.find((a) => a.symbol === 'USDC');
  assert.deepEqual([usdc.pool, usdc.scope, usdc.minimumDeposit, usdc.vettingFeeBps, usdc.maxRelayFeeBps], [POOL, pools.scope.toString(), '1000000', '50', '1000']);
  assert.match(res.data.assets.find((a) => a.symbol === 'NOX').problem, /no pool for NOX/);
  assert.deepEqual([res.data.network, res.data.entrypoint], ['mainnet', ENTRYPOINT]);
});

test('the sets come from the provider, with leaves it hasn’t indexed yet taken from the pool’s own events', async () => {
  services.state.aspLeaves = ['11', '22'];
  services.state.stateLeaves = ['101', '102'];
  pools.roots({ aspRoot: 999n, stateRoot: 888n, size: 3 });
  chain.addLogs({ hash: `0x${'61'.repeat(32)}`, logs: [{ address: POOL, topics: [poolAbi.leafInserted], data: `0x${pad(2)}${pad(103)}${pad(888)}` }] });
  const res = await owner('GET', '/api/pools/USDC/sets');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data, { aspLeaves: ['11', '22'], aspRoot: '999', stateLeaves: ['101', '102', '103'], stateRoot: '888' });
  assert.equal(services.requests.at(-1).headers['x-pool-scope'], pools.scope.toString());

  // a provider sending something that isn't a field element is refused, not passed on
  await new Promise((r) => setTimeout(r, 5100));
  services.state.aspLeaves = ['11', 'abc'];
  assert.equal((await owner('GET', '/api/pools/USDC/sets')).status, 502);
});

test('review statuses are asked by label and come back in plain words', async () => {
  services.state.reviews = [{ label: '5', reviewStatus: 'approved' }, { label: '6', reviewStatus: { decisionStatus: 'declined' } }, { label: '7', reviewStatus: 'mystery' }];
  const res = await owner('POST', '/api/pools/USDC/review', { labels: ['5', '6', '7', '8'] });
  assert.deepEqual(res.data.statuses.map((s) => s.status), ['approved', 'declined', 'unknown', 'unknown']);
  assert.equal(services.requests.at(-1).headers['x-labels'], '5,6,7,8');
  assert.equal((await owner('POST', '/api/pools/USDC/review', { labels: ['x'] })).status, 400);
});

test('a deposit’s receipt gives its label and credited value, only from a configured pool', async () => {
  const hash = DEPOSIT.transactionHash;
  // the Sepolia deposit, replayed as if the mainnet USDC pool had emitted it
  chain.addLogs({ hash, logs: DEPOSIT.logs.map((l) => ({ ...l, address: l.address.toLowerCase() === SEPOLIA_POOL ? POOL : l.address })) });
  const res = await owner('GET', `/api/pools/receipts/${hash}`);
  assert.equal(res.status, 200);
  const deposit = res.data.events.find((e) => e.type === 'deposit');
  assert.deepEqual([deposit.symbol, deposit.value, deposit.label, deposit.depositor], ['USDC', '9900000', '6316452312530983954958156091796148311400159161734386852330634622383099210301', '0x3c1c177ff0b1c74fa28fa8704a4695e1d5ea50ec']);
  // the same logs from a pool this server doesn't use count for nothing
  const elsewhere = `0x${'62'.repeat(32)}`;
  chain.addLogs({ hash: elsewhere, logs: DEPOSIT.logs });
  assert.deepEqual((await owner('GET', `/api/pools/receipts/${elsewhere}`)).data.events, []);
  assert.equal((await owner('GET', '/api/pools/receipts/0x12')).status, 400);
});

test('pool events are read a bounded range at a time', async () => {
  const head = chain.head();
  const res = await owner('POST', '/api/pools/USDC/events', { fromBlock: head - 100, toBlock: head });
  assert.equal(res.status, 200);
  assert.ok(res.data.events.some((e) => e.type === 'deposit'));
  assert.ok(res.data.events.every((e) => e.type !== 'leaf'));
  assert.equal((await owner('POST', '/api/pools/USDC/events', { fromBlock: 0, toBlock: 20_000 })).status, 400);
  assert.equal((await owner('POST', '/api/pools/USDC/events', { fromBlock: 5, toBlock: 1 })).status, 400);
});

test('the pool account is sealed per admin, shared only with admins, and its notes never overwrite each other', async () => {
  assert.deepEqual((await owner('GET', '/api/pool-account')).data.account, { exists: false });
  assert.equal((await owner('POST', '/api/pool-account', { keyTag: 'nope', wrapped: 'abc', notes: 'def' })).status, 400);
  const made = await owner('POST', '/api/pool-account', { keyTag: tag, wrapped: 'sealed-to-erik', notes: 'notes-v1' });
  assert.equal(made.status, 200);
  assert.deepEqual([made.data.account.wrapped, made.data.account.notesRev, made.data.account.holders], ['sealed-to-erik', 1, [ids.owner]]);
  assert.equal(made.data.account.startBlock, chain.head());
  assert.equal((await ada('POST', '/api/pool-account', { keyTag: tag, wrapped: 'x', notes: 'y' })).status, 409);

  // Ada isn't a holder yet: she sees the account but no key, and can't write notes
  const adaView = (await ada('GET', '/api/pool-account')).data.account;
  assert.deepEqual([adaView.exists, adaView.wrapped, adaView.notes], [true, null, 'notes-v1']);
  assert.equal((await ada('PUT', '/api/pool-account/notes', { notes: 'evil', rev: 1 })).status, 409);
  assert.equal((await ada('PUT', '/api/pool-account/keys', { grants: [{ userId: ids.Ada, wrapped: 'self' }] })).status, 409);
  assert.equal((await ada('DELETE', '/api/pool-account')).status, 409);

  // only to admins, never to members
  assert.equal((await owner('PUT', '/api/pool-account/keys', { grants: [{ userId: ids.Mia, wrapped: 'to-mia' }] })).status, 400);
  assert.equal((await owner('PUT', '/api/pool-account/keys', { grants: [{ userId: ids.Ada, wrapped: 'to-ada' }] })).status, 200);
  assert.equal((await ada('GET', '/api/pool-account')).data.account.wrapped, 'to-ada');

  // two admins saving from the same revision: the second is told to reload
  assert.equal((await owner('PUT', '/api/pool-account/notes', { notes: 'notes-v2', rev: 1 })).data.account.notesRev, 2);
  assert.equal((await ada('PUT', '/api/pool-account/notes', { notes: 'notes-v2-ada', rev: 1 })).status, 409);
  assert.equal((await ada('PUT', '/api/pool-account/notes', { notes: 'notes-v3', rev: 2 })).data.account.notes, 'notes-v3');

  // an admin who becomes a member stops being a holder, and gets nothing
  assert.equal((await owner('PATCH', `/api/users/${ids.Ada}`, { role: 'member' })).status, 200);
  assert.deepEqual((await owner('GET', '/api/pool-account')).data.account.holders, [ids.owner]);
  assert.equal((await ada('GET', '/api/pool-account')).status, 403);

  // starting over: a holder drops the account, and then a new key can be set up
  assert.deepEqual((await owner('DELETE', '/api/pool-account')).data.account, { exists: false });
  assert.equal((await owner('POST', '/api/pool-account', { keyTag: 'b'.repeat(32), wrapped: 'new-seal', notes: 'fresh' })).data.account.keyTag, 'b'.repeat(32));
});
