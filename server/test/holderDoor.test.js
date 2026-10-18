import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import agentCalls from './helpers/agentCalls.js';

// One stack of NOX has to keep one person in through the holder door, not one per account: not
// by being linked to account after account without moving, not by passing between wallets in
// time for each sign-in, and not through access keys once its holders are locked out.
const NOX = 10n ** 18n;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const STACK = 1000n * NOX;
let srv;
let sql;
let recheckHolders;
const chain = mockChain();
const base = () => srv.base;
const { rest } = agentCalls(base);
let ip = 0;
// each person comes from an address of their own, so the sign-in rate limit stays out of it
const person = () => client(base, { headers: { 'X-Forwarded-For': `198.51.100.${++ip}` } });
const owner = person();

const one = (id) => ({ ...sql.get('SELECT holder_below_since AS below, holder_held_since AS held, holder_locked_at AS locked FROM users WHERE id = ?', id) });
const sessionsOf = (id) => sql.get('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', id).n;
// time passes: every shortfall and every run of holding started that much earlier
const age = (ms) => sql.run("UPDATE users SET holder_below_since = holder_below_since - ?, holder_held_since = holder_held_since - ? WHERE joined_via = 'holder'", ms, ms);
async function scheduledCheck() {
  sql.run("UPDATE users SET holder_checked_at = ? WHERE joined_via = 'holder'", Date.now() - 7 * HOUR);
  await recheckHolders();
}
async function credentialId(who, address) {
  return (await who('GET', '/api/me/credentials')).data.credentials.find((c) => c.address === address).id;
}
async function link(who, signer, extra) {
  await who.wallet(signer, 'confirm');
  return who.wallet(extra, 'add');
}

before(async () => {
  srv = await startServer({ chain, env: { TRUST_PROXY: 'loopback' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: recheckHolders } = await import('../services/recheckHolders.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Olga', workspaceName: 'Acme' });
  await owner('PUT', '/api/holder-gate', { enabled: true, minimum: STACK.toString() });
});
after(() => srv.close());

test('a stack that never moves lets one person in, even after it’s unlinked', async () => {
  const stack = wallet();
  chain.setBalance(stack.address, STACK);
  const first = person();
  const own = wallet();
  const firstId = (await first.wallet(stack, 'holder', { name: 'Sock one' })).data.user.id;
  assert.equal((await link(first, stack, own)).status, 200);
  assert.equal((await first('DELETE', `/api/me/credentials/${await credentialId(first, stack.address)}`)).status, 200);

  // joining again with it is refused, before and after signing
  const second = person();
  const refused = await second.wallet(stack, 'holder', { name: 'Sock two' });
  assert.equal(refused.status, 403);
  assert.match(refused.data.error, /counted for someone already in this workspace/);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM users WHERE joined_via = 'holder'").n, 1);

  // another account it's lent to gets nothing from it
  const other = wallet();
  chain.setBalance(other.address, 0n);
  const invite = await owner('POST', '/api/invites', { role: 'member' });
  const honest = person();
  const honestId = (await honest.wallet(other, 'invite', { name: 'Borrower', inviteToken: invite.data.token })).data.user.id;
  sql.run("UPDATE users SET joined_via = 'holder' WHERE id = ?", honestId);
  assert.equal((await link(honest, other, stack)).status, 200);
  await scheduledCheck();
  assert.ok(one(honestId).below, 'the borrowed stack didn’t count');
  assert.equal(one(firstId).below !== null, true, 'and the account it left is below too');

  // the memory runs out after the grace period, and then the wallet is free again
  sql.run('UPDATE holder_wallets SET counted_at = ? WHERE address = ?', Date.now() - 4 * DAY, stack.address);
  await scheduledCheck();
  assert.equal(sql.get('SELECT user_id FROM holder_wallets WHERE address = ?', stack.address).user_id, honestId);
  sql.run("UPDATE users SET deactivated = 1 WHERE joined_via = 'holder'");
});

test('passing one stack around keeps one person in once the grace period is over', async () => {
  const people = Array.from({ length: 3 }, () => ({ w: wallet(), c: person() }));
  const move = (to) => {
    for (const p of people) chain.setBalance(p.w.address, p === to ? STACK : 0n);
  };
  for (const [i, p] of people.entries()) {
    move(p);
    p.id = (await p.c.wallet(p.w, 'holder', { name: `Sharer ${i}` })).data.user.id;
  }
  await recheckHolders();
  for (let round = 0; round < 8; round++) {
    age(0.5 * DAY);
    // each takes the stack for their own sign-in, then it goes back to the first for the check
    for (const p of people) {
      move(p);
      await person().wallet(p.w, 'login');
    }
    move(people[0]);
    await scheduledCheck();
  }
  assert.deepEqual(people.map((p) => Boolean(one(p.id).locked)), [false, true, true]);
  assert.deepEqual(people.map((p) => sessionsOf(p.id) > 0), [true, false, false]);
  move(people[1]);
  assert.equal((await person().wallet(people[1].w, 'login')).status, 403);
  sql.run("UPDATE users SET deactivated = 1 WHERE joined_via = 'holder'");
});

test('a sign-in never ends a shortfall; the scheduled checks have to see the holding', async () => {
  const w = wallet();
  chain.setBalance(w.address, STACK);
  const id = (await person().wallet(w, 'holder', { name: 'Dipper' })).data.user.id;
  chain.setBalance(w.address, 0n);
  await scheduledCheck();
  const since = one(id).below;
  assert.ok(since);
  // back for a sign-in: still the same grace period, which doesn't start over
  chain.setBalance(w.address, STACK);
  assert.equal((await person().wallet(w, 'login')).status, 200);
  assert.deepEqual(one(id), { below: since, held: null, locked: null });
  // the checks see it, but the shortfall only ends after holding for the whole grace period
  await scheduledCheck();
  assert.ok(one(id).held);
  age(2 * DAY);
  await scheduledCheck();
  assert.equal(one(id).below, since - 2 * DAY);
  chain.setBalance(w.address, 0n);
  await scheduledCheck();
  assert.equal(one(id).held, null);
  // dipping again before that keeps the first grace period, which has run out by now
  age(1.5 * DAY);
  await scheduledCheck();
  assert.ok(one(id).locked);
  assert.equal(sessionsOf(id), 0);

  // topping up isn't enough to walk straight back in
  chain.setBalance(w.address, STACK);
  assert.equal((await person().wallet(w, 'login')).status, 403);
  await scheduledCheck();
  assert.equal((await person().wallet(w, 'login')).status, 403);
  age(6 * HOUR);
  assert.equal((await person().wallet(w, 'login')).status, 200);
  age(3 * DAY);
  await scheduledCheck();
  assert.deepEqual(one(id), { below: null, held: null, locked: null });
  sql.run('UPDATE users SET deactivated = 1 WHERE id = ?', id);
});

test('a locked-out holder’s access keys stop working until they’re back', async () => {
  const w = wallet();
  chain.setBalance(w.address, STACK);
  const holder = person();
  const id = (await holder.wallet(w, 'holder', { name: 'Keyholder' })).data.user.id;
  await holder.wallet(w, 'confirm');
  const key = (await holder('POST', '/api/me/tokens', { name: 'script', scope: 'write', days: 30 })).data.token;
  assert.equal((await rest(key, 'GET', '/tasks')).status, 200);
  chain.setBalance(w.address, 0n);
  await scheduledCheck();
  age(4 * DAY);
  await scheduledCheck();
  assert.ok(one(id).locked);
  assert.equal((await rest(key, 'GET', '/tasks')).status, 401);
  assert.equal((await rest(key, 'POST', '/tasks', { title: 'still here' })).status, 401);
  const mcp = await fetch(`${base()}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  assert.equal(mcp.status, 401);
  // holding again for the recheck window brings the keys back
  chain.setBalance(w.address, STACK);
  await scheduledCheck();
  age(6 * HOUR);
  await scheduledCheck();
  assert.equal(one(id).locked, null);
  assert.equal((await rest(key, 'GET', '/tasks')).status, 200);
});
