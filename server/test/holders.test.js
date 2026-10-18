import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = 10n ** 18n;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
let srv;
let sql;
let recheckHolders;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: recheckHolders } = await import('../services/recheckHolders.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('the open door is shut until an admin sets a minimum', async () => {
  const visitor = client(base);
  assert.equal((await visitor('GET', '/api/auth/state')).data.holderGate, null);
  assert.equal((await visitor.wallet(wallet(), 'holder', { name: 'Early Bird' })).status, 403);
  const gate = await owner('PUT', '/api/holder-gate', { enabled: true, minimum: (1000n * NOX).toString() });
  assert.equal(gate.data.enabled, true);
  const state = (await visitor('GET', '/api/auth/state')).data.holderGate;
  assert.equal(state.minimum, (1000n * NOX).toString());
  assert.equal(state.symbol, 'NOX');
});

test('a wallet below the minimum is turned away with a clear reason', async () => {
  const small = wallet();
  chain.setBalance(small.address, 500n * NOX);
  const res = await client(base).wallet(small, 'holder', { name: 'Small Fish' });
  assert.equal(res.status, 403);
  assert.match(res.data.error, /holds 500 NOX counting NOX held, staked and Zero-State Passes.*at least 1,000 NOX/);
});

test('NOX staked and Zero-State Passes count toward the minimum', async () => {
  const staker = wallet();
  chain.setBalance(staker.address, 300n * NOX);
  chain.setStake(staker.address, 700n * NOX);
  assert.equal((await client(base).wallet(staker, 'holder', { name: 'Staker' })).status, 200);
  // one pass is worth HOLDER_ZSP_NOX (100,000 by default), far over the minimum on its own
  const passHolder = wallet();
  chain.setTokenBalance(ZSP, passHolder.address, 1);
  assert.equal((await client(base).wallet(passHolder, 'holder', { name: 'Pass holder' })).status, 200);
});

test('a holder who falls below gets a grace period and a notice, then is turned away', async () => {
  const holder = wallet();
  chain.setBalance(holder.address, 2500n * NOX);
  const joined = await client(base).wallet(holder, 'holder', { name: 'Whale' });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.user.role, 'member');
  assert.equal(joined.data.user.joinedVia, 'holder');
  ids.holder = joined.data.user.id;
  const session = client(base);
  assert.equal((await session.wallet(holder, 'login')).status, 200);

  chain.setBalance(holder.address, 10n * NOX);
  // not locked out on the spot: the sign-in works, and a notice says until when
  assert.equal((await session.wallet(holder, 'login')).status, 200);
  const notice = (await session('GET', '/api/notifications')).data.find((n) => n.type === 'holder_low');
  assert.ok(notice);
  assert.equal(notice.data.minimum, (1000n * NOX).toString());
  assert.ok(notice.data.until > Date.now() + 2.9 * DAY);
  // and only one notice, however often they sign in
  await session.wallet(holder, 'login');
  assert.equal((await session('GET', '/api/notifications')).data.filter((n) => n.type === 'holder_low').length, 1);

  // once the grace period is over the door stays shut until they've held enough for a while
  sql.run('UPDATE users SET holder_below_since = ? WHERE id = ?', Date.now() - 4 * DAY, ids.holder);
  const refused = await client(base).wallet(holder, 'login');
  assert.equal(refused.status, 403);
  assert.match(refused.data.error, /hold 10 NOX.*at least 1,000 NOX, and the grace period ended/);
  chain.setBalance(holder.address, 1000n * NOX);
  // topping up isn't enough at the moment of signing in: the scheduled checks have to see it
  const early = await client(base).wallet(holder, 'login');
  assert.equal(early.status, 403);
  assert.match(early.data.error, /hold enough again.*regular checks, every 6 hours, have seen at least 1,000 NOX there for 6 hours/);
  sql.run('UPDATE users SET holder_checked_at = ? WHERE id = ?', Date.now() - 7 * HOUR, ids.holder);
  await recheckHolders();
  assert.equal((await client(base).wallet(holder, 'login')).status, 403);
  sql.run('UPDATE users SET holder_held_since = holder_held_since - ? WHERE id = ?', 6 * HOUR, ids.holder);
  assert.equal((await client(base).wallet(holder, 'login')).status, 200);
  // the shortfall stays on record until the checks have seen them hold for a whole grace period
  assert.ok(sql.get('SELECT holder_below_since FROM users WHERE id = ?', ids.holder).holder_below_since);
  sql.run('UPDATE users SET holder_held_since = ?, holder_checked_at = ? WHERE id = ?', Date.now() - 4 * DAY, Date.now() - 7 * HOUR, ids.holder);
  await recheckHolders();
  assert.equal(sql.get('SELECT holder_below_since FROM users WHERE id = ?', ids.holder).holder_below_since, null);

  chain.setBalance(holder.address, 0n);
  sql.run('UPDATE users SET holder_below_since = ? WHERE id = ?', Date.now() - 4 * DAY, ids.holder);
  await owner('PATCH', `/api/users/${ids.holder}`, { keepWithoutNox: true });
  assert.equal((await client(base).wallet(holder, 'login')).status, 200);
});

test('the same NOX can’t let several wallets in one after another', async () => {
  const first = wallet();
  const second = wallet();
  chain.setBalance(first.address, 1500n * NOX);
  const a = client(base);
  const firstId = (await a.wallet(first, 'holder', { name: 'First' })).data.user.id;
  // the tokens move on and a second wallet joins with them
  chain.setBalance(first.address, 0n);
  chain.setBalance(second.address, 1500n * NOX);
  assert.equal((await client(base).wallet(second, 'holder', { name: 'Second' })).status, 200);
  // joining re-checks the members who came in the same way
  for (let i = 0; i < 50 && !sql.get('SELECT holder_below_since FROM users WHERE id = ?', firstId).holder_below_since; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(sql.get('SELECT holder_below_since FROM users WHERE id = ?', firstId).holder_below_since);
  assert.equal((await a('GET', '/api/notifications')).data.filter((n) => n.type === 'holder_low').length, 1);

  // after the grace period, the scheduled re-check signs the first wallet out
  sql.run('UPDATE users SET holder_below_since = ?, holder_checked_at = ? WHERE id = ?', Date.now() - 4 * DAY, Date.now() - 7 * 3_600_000, firstId);
  assert.equal((await a('GET', '/api/bootstrap')).status, 200);
  await recheckHolders();
  assert.equal((await a('GET', '/api/bootstrap')).status, 401);
});

test('a node that doesn’t answer never costs anyone their place', async () => {
  const steady = wallet();
  chain.setBalance(steady.address, 1500n * NOX);
  const id = (await client(base).wallet(steady, 'holder', { name: 'Steady' })).data.user.id;
  // the node itself is out for balance reads, the way an overloaded provider answers
  let lift = chain.refuse((method) => method === 'eth_call', { status: 503, error: { code: -32603, message: 'Service unavailable' } });
  chain.setBalance(steady.address, 0n);
  sql.run('UPDATE users SET holder_checked_at = ? WHERE id = ?', Date.now() - 7 * 3_600_000, id);
  await recheckHolders();
  lift();
  chain.setBalance(steady.address, 1500n * NOX);
  assert.equal(sql.get('SELECT holder_below_since FROM users WHERE id = ?', id).holder_below_since, null);
  // and a join that can't be checked is refused rather than waved through
  lift = chain.refuse((method) => method === 'eth_call', { status: 503, error: { code: -32603, message: 'Service unavailable' } });
  const res = await client(base).wallet(wallet(), 'holder', { name: 'Unchecked' });
  lift();
  assert.equal(res.status, 502);
});

test('a staking or pass contract that reverts counts as nothing staked and no passes, as in votes', async () => {
  const STAKING = '0xa94d6009790ba13597a1e1b7cf4e1531ea513613';
  chain.breakContract(ZSP);
  chain.breakContract(STAKING);
  try {
    // NOX in the wallet still lets someone in and keeps them in
    const holder = wallet();
    chain.setBalance(holder.address, 1200n * NOX);
    const joined = await client(base).wallet(holder, 'holder', { name: 'Plain holder' });
    assert.equal(joined.status, 200);
    assert.equal((await client(base).wallet(holder, 'login')).status, 200);
    assert.equal(sql.get('SELECT holder_below_since FROM users WHERE id = ?', joined.data.user.id).holder_below_since, null);
    // a stake behind a reverting contract counts for nothing, rather than failing the join
    const staker = wallet();
    chain.setBalance(staker.address, 300n * NOX);
    chain.setStake(staker.address, 700n * NOX);
    const refused = await client(base).wallet(staker, 'holder', { name: 'Stuck staker' });
    assert.equal(refused.status, 403);
    assert.match(refused.data.error, /holds 300 NOX/);
  } finally {
    chain.fixContract(ZSP);
    chain.fixContract(STAKING);
  }
});

test('members can see the gate but only admins can change it', async () => {
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const member = client(base);
  await member.wallet(wallet(), 'invite', { name: 'Invited', inviteToken: inv.data.token });
  assert.equal((await member('GET', '/api/holder-gate')).data.enabled, true);
  assert.equal((await member('PUT', '/api/holder-gate', { enabled: false })).status, 403);
  await owner('PUT', '/api/holder-gate', { enabled: false, minimum: null });
  assert.equal((await client(base).wallet(wallet(), 'holder', { name: 'Late' })).status, 403);
});
