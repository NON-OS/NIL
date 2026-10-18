import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Many people joining through the holder door at once: the seat limit still holds, and the
// re-check each join asks for doesn't multiply into a flood of reads at the node.
const NOX = 10n ** 18n;
let srv;
let sql;
let billingState;
let plan;
let recheckHolders;
const chain = mockChain();
const base = () => srv.base;
let ip = 0;
const person = () => client(base, { headers: { 'X-Forwarded-For': `198.51.100.${++ip}` } });
const owner = person();

// opens every challenge first, then signs them all at once while the node is slow to answer
async function joinAtOnce(count) {
  const people = Array.from({ length: count }, () => ({ w: wallet(), c: person() }));
  for (const p of people) chain.setBalance(p.w.address, 1000n * NOX);
  const opened = [];
  for (const [i, p] of people.entries()) opened.push(await p.c('POST', '/api/auth/wallet/challenge', { address: p.w.address, mode: 'holder', name: `Joiner ${i}` }));
  chain.setCallDelay(300);
  try {
    return await Promise.all(people.map((p, i) => p.c('POST', '/api/auth/wallet/verify', { challengeId: opened[i].data.challengeId, signature: p.w.sign(opened[i].data.message) })));
  } finally {
    chain.setCallDelay(0);
  }
}

before(async () => {
  srv = await startServer({ chain, env: { TRUST_PROXY: 'loopback', PLAN_TREASURY: `0x${'11'.repeat(20)}`, PLAN_TRIAL_DAYS: '0', PLAN_FREE_SEATS: '2' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: billingState } = await import('../billing/billingState.js'));
  ({ default: plan } = await import('../services/plan.js'));
  ({ default: recheckHolders } = await import('../services/recheckHolders.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Olga', workspaceName: 'Acme' });
  billingState.set('plan', { paidUntil: Date.now() + 10 * 86_400_000, seatLimit: 4 });
  await owner('PUT', '/api/holder-gate', { enabled: true, minimum: (1000n * NOX).toString() });
});
after(() => srv.close());

test('holders joining at the same moment can’t take more seats than the plan has', async () => {
  const results = await joinAtOnce(6);
  assert.equal(results.filter((r) => r.status === 200).length, 3);
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 402));
  assert.deepEqual([plan.status().seatsUsed, plan.status().seatLimit], [4, 4]);
  await recheckHolders();
});

test('a burst of joins shares the re-check passes instead of each starting its own', async () => {
  billingState.set('plan', { paidUntil: Date.now() + 10 * 86_400_000, seatLimit: 40 });
  const before = chain.calls.length;
  const results = await joinAtOnce(8);
  assert.ok(results.every((r) => r.status === 200));
  await recheckHolders();
  const passes = chain.calls.slice(before).filter((c) => c.method === 'eth_blockNumber').length;
  // one pass already running when the burst arrives, and one more for everyone who asked during it
  assert.ok(passes <= 2, `${passes} passes`);
  const members = sql.get("SELECT COUNT(*) AS n FROM users WHERE joined_via = 'holder'").n;
  const reads = chain.calls.slice(before).filter((c) => c.method === 'eth_call').length;
  // each joiner's own check, then at most two passes over every member, three reads per wallet
  assert.ok(reads <= 8 * 3 + 2 * members * 3, `${reads} reads for ${members} members`);
});
