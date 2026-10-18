// The live Privacy Pools check: a bounty paid from a team pool end to end, on a fork of Ethereum
// mainnet with 0xbow's real entry contract, USDC pool, verifiers and circuits. 0xbow's relayer
// and association set provider can't see a fork, so local stand-ins take their place: the
// relayer really sends Entrypoint.relay, and the check approves its deposit by updating the
// association root as the real postman. Opt-in and slow; not part of npm test.
//
//   ANVIL=/path/to/anvil node --experimental-strip-types --import ./scripts/test/registerTs.mjs scripts/live/chain/checkPools.mjs
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1';
import nilClient from './nilClient.mjs';
import stealthKeys from './stealthKeys.mjs';
import calls from './calls.mjs';
import poolFork from './pools/poolFork.mjs';
import poolSteps from './pools/poolSteps.mjs';

const USDC = 10n ** 6n;
const step = (what) => console.log(`  ${what}`);
const balance = async (rpc, token, who) => BigInt(await rpc('eth_call', [{ to: token, data: calls.balanceOf(who) }, 'latest']));

const fork = await poolFork();
const { anvil, chain, nil, owner, member, relayer } = fork;
console.log(`Nil at ${nil.base}, fork of mainnet block ${anvil.forkBlock}, server log ${nil.logFile}`);

let failed = false;
try {
  const admin = nilClient(nil.base);
  const contributor = nilClient(nil.base);
  await admin.wallet(owner, 'setup', { name: 'Erik', workspaceName: 'Pools' });
  const invite = await admin.post('/invites', { role: 'member' });
  const miaId = (await contributor.wallet(member, 'invite', { name: 'Mia', inviteToken: invite.token })).user.id;
  const spending = secp256k1.utils.randomPrivateKey();
  const viewing = secp256k1.utils.randomPrivateKey();
  const meta = stealthKeys.meta(spending, viewing);
  await contributor.put('/me/stealth', { metaAddress: meta });

  const info = await admin.get('/pools');
  const usdcInfo = info.assets.find((a) => a.symbol === 'USDC');
  assert.equal(usdcInfo.pool, fork.pool);
  step(`Nil reads the real USDC pool: scope ${usdcInfo.scope.slice(0, 12)}…, minimum ${Number(usdcInfo.minimumDeposit) / 1e6} USDC, vetting fee ${usdcInfo.vettingFeeBps} bps, relay cap ${usdcInfo.maxRelayFeeBps} bps`);
  step(`tree has ${fork.size} leaves at the fork; the provider stand-in serves ${fork.services.state.stateLeaves.length} of 0xbow's own snapshot`);

  const pool = poolSteps({ api: admin, chain, wallet: owner, info });
  await pool.create();
  step('pool account made; key sealed to the admin, notes encrypted');

  const deposit = await pool.deposit(30n * USDC);
  step(`deposited 30 USDC; the pool credited ${Number(deposit.value) / 1e6} after the vetting fee, label ${deposit.label.slice(0, 10)}…`);
  assert.equal(deposit.value, 30n * USDC - (30n * USDC * BigInt(usdcInfo.vettingFeeBps)) / 10_000n);
  step(`association root updated as the postman, ${await fork.approve(deposit.label)} labels`);

  const task = (await admin.post('/tasks', { title: 'Private pool bounty', assigneeId: miaId, bounty: String(10n * USDC), bountyToken: 'USDC', status: 'done' })).task;
  await chain.mine(1);
  const paid = await pool.pay(task, meta);
  step(`proved the withdrawal in ${(paid.provingMs / 1000).toFixed(1)} s; relayer fee ${paid.quote.fee} of ${paid.quote.gross} withdrawn; relay tx ${paid.payment.txHash.slice(0, 12)}…`);
  assert.equal(paid.payment.via, 'pool');

  // the contributor can open the one-time address the admin's side worked out, from what Nil
  // lists for them
  const payout = (await contributor.get('/stealth/payouts')).payouts.find((p) => p.address === paid.intent.to);
  assert.equal(stealthKeys.open(spending, viewing, payout.ephemeralPublicKey).address, paid.intent.to);

  await chain.finalize();
  const checked = (await admin.post(`/payments/${paid.payment.id}/check`)).payment;
  assert.deepEqual([checked.status, checked.state, checked.amount, checked.from, checked.relayFee], ['confirmed', 'paid', paid.intent.amount, fork.entrypoint, paid.quote.fee]);
  assert.equal(await balance(anvil.rpc, usdcInfo.token, paid.intent.to), BigInt(paid.intent.amount));
  assert.equal(await balance(anvil.rpc, usdcInfo.token, relayer.address), BigInt(paid.quote.fee));
  step(`Nil verified and credited ${Number(checked.amount) / 1e6} USDC, exact, from the entry contract once final`);

  const again = await admin.raw('POST', `/api/pool-payouts/${paid.intent.id}/relay`, paid.body);
  assert.equal(again.status, 409);
  step('a second relay for the same payout is refused');

  const left = pool.book().notes.find((n) => n.label === deposit.label);
  const before = await balance(anvil.rpc, usdcInfo.token, owner.address);
  await pool.ragequit(left);
  assert.equal((await balance(anvil.rpc, usdcInfo.token, owner.address)) - before, BigInt(left.value));
  step(`ragequit returned the remaining ${Number(left.value) / 1e6} USDC to the depositing wallet`);

  const rebuilt = await pool.rebuild(deposit.block - 1, await chain.head());
  assert.deepEqual(rebuilt.map((n) => [n.label, n.spends, n.state]), [[deposit.label, 1, 'exited']]);
  step('notes rebuilt from the key and public events alone match what happened');
} catch (err) {
  failed = true;
  console.log(`FAIL  ${err.stack ?? err}`);
}
await fork.stop();
globalThis.curve_bn128?.terminate();
console.log(failed ? 'the pool check failed' : 'the pool check passed');
process.exit(failed ? 1 : 0);
