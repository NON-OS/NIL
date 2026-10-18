// The live Privacy Pools check: a bounty paid from a team pool end to end, on a fork of Ethereum
// mainnet with 0xbow's real entry contract, USDC pool, verifiers and circuits. 0xbow's relayer
// and association set provider can't see a fork, so local stand-ins take their place: the
// relayer really sends Entrypoint.relay, and the check approves its deposit by updating the
// association root as the real postman. Opt-in and slow; not part of npm test.
//
//   ANVIL=/path/to/anvil node --experimental-strip-types --import ./scripts/test/registerTs.mjs scripts/live/chain/checkPools.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Group } from '@semaphore-protocol/group';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import startAnvil from './startAnvil.mjs';
import limitsProxy from './limitsProxy.mjs';
import devChain from './devChain.mjs';
import testWallet from './testWallet.mjs';
import fundWallet from './fundWallet.mjs';
import bootNil from './bootNil.mjs';
import nilClient from './nilClient.mjs';
import stealthKeys from './stealthKeys.mjs';
import calls from './calls.mjs';
import forkPoolServices from './pools/forkPoolServices.mjs';
import poolSteps from './pools/poolSteps.mjs';
import poolAbi from '../../../server/pools/poolAbi.js';

const ETH = 10n ** 18n;
const USDC = 10n ** 6n;
const ENTRYPOINT = '0x6818809eefce719e480a7526d76bd3e561526b46';
const USDC_POOL = '0xb419c2867ab3cbc78921660cb95150d95a94ce86';
// sends every association root update to the mainnet entry contract (read from its RootUpdated events)
const POSTMAN = '0x1f4fe25cf802a0605229e0dc497aaf653e86e187';
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const step = (what) => console.log(`  ${what}`);

function updateRoot(root, cid) {
  const bytes = Buffer.from(cid).toString('hex');
  return `0x${calls.selector('updateRoot(uint256,string)')}${word(root)}${word(0x40)}${word(cid.length)}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0')}`;
}
const balance = async (rpc, token, who) => BigInt(await rpc('eth_call', [{ to: token, data: calls.balanceOf(who) }, 'latest']));

const anvil = await startAnvil({ port: Number(process.env.LIVE_CHAIN_PORT || 8546), log: fs.openSync(path.join(os.tmpdir(), 'nil-live-pools-anvil.log'), 'a') });
const proxy = await limitsProxy({ upstream: anvil.url });
const chain = devChain(anvil.rpc);
const [owner, member, relayer] = [testWallet(anvil.rpc), testWallet(anvil.rpc), testWallet(anvil.rpc)];
await fundWallet(chain, owner.address, { eth: 2n * ETH, usdc: 100n * USDC });
await fundWallet(chain, relayer.address, { eth: 2n * ETH });
await chain.setBalance(POSTMAN, ETH);
const services = await forkPoolServices({ relayer, entrypoint: ENTRYPOINT });
const nil = await bootNil({ rpcUrl: proxy.url, env: { NOX_CHAIN_ID: '1', PRIVACY_POOLS: 'on', PRIVACY_POOLS_RELAYER_URL: services.url, PRIVACY_POOLS_ASP_URL: services.url } });
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
  await contributor.put('/me/stealth', { metaAddress: stealthKeys.meta(spending, viewing) });

  const info = await admin.get('/pools');
  const usdcInfo = info.assets.find((a) => a.symbol === 'USDC');
  assert.equal(usdcInfo.pool, USDC_POOL);
  step(`Nil reads the real USDC pool: scope ${usdcInfo.scope.slice(0, 12)}…, minimum ${Number(usdcInfo.minimumDeposit) / 1e6} USDC, vetting fee ${usdcInfo.vettingFeeBps} bps, relay cap ${usdcInfo.maxRelayFeeBps} bps`);

  const pool = poolSteps({ api: admin, chain, wallet: owner, info });
  await pool.create();
  step('pool account made; key sealed to the admin, notes encrypted');

  // the provider's snapshot of the tree as of the fork
  const size = Number(BigInt(await anvil.rpc('eth_call', [{ to: USDC_POOL, data: `0x${calls.selector('currentTreeSize()')}` }, 'latest'])));
  const real = await fetch('https://api.0xbow.io/1/public/mt-leaves', { headers: { 'X-Pool-Scope': BigInt(usdcInfo.scope).toString() } }).then((r) => r.json()).catch(() => null);
  services.state.stateLeaves = (real?.stateTreeLeaves ?? []).slice(0, size);
  step(`tree has ${size} leaves at the fork; the provider stand-in serves ${services.state.stateLeaves.length} of 0xbow's own snapshot`);

  const deposit = await pool.deposit(30n * USDC);
  // a real provider indexes new leaves within minutes; the stand-in learns ours from the receipt
  const inserted = (await chain.receipt(deposit.hash)).logs.find((l) => l.address.toLowerCase() === USDC_POOL && l.topics[0] === poolAbi.leafInserted);
  services.state.stateLeaves.push(BigInt(`0x${inserted.data.slice(66, 130)}`).toString());
  step(`deposited 30 USDC; the pool credited ${Number(deposit.value) / 1e6} after the vetting fee, label ${deposit.label.slice(0, 10)}…`);
  assert.equal(deposit.value, 30n * USDC - (30n * USDC * BigInt(usdcInfo.vettingFeeBps)) / 10_000n);

  // approve the deposit: a new association root holding 0xbow's approved labels and ours
  const approved = [...new Set([...(real?.aspLeaves ?? []), deposit.label])];
  const root = new Group(approved.map(BigInt)).root;
  const rooted = await chain.receipt(await chain.as(POSTMAN, { to: ENTRYPOINT, data: updateRoot(root, `bafkreinilprivacypoolslivecheck${'x'.repeat(28)}`) }));
  assert.equal(rooted.status, '0x1');
  services.state.aspLeaves = approved.map(String);
  step(`association root updated as the postman, ${approved.length} labels`);

  const task = (await admin.post('/tasks', { title: 'Private pool bounty', assigneeId: miaId, bounty: String(10n * USDC), bountyToken: 'USDC', status: 'done' })).task;
  const ephemeralKey = `0x${bytesToHex(secp256k1.utils.randomPrivateKey())}`;
  await chain.mine(1);
  const paid = await pool.pay(task, ephemeralKey);
  step(`proved the withdrawal in ${(paid.provingMs / 1000).toFixed(1)} s; relayer fee ${paid.quote.fee} of ${paid.quote.gross} withdrawn; relay tx ${paid.payment.txHash.slice(0, 12)}…`);
  assert.equal(paid.payment.via, 'pool');

  // the contributor can open the one-time address from what Nil lists for them
  const payout = (await contributor.get('/stealth/payouts')).payouts.find((p) => p.address === paid.intent.to);
  assert.equal(stealthKeys.open(spending, viewing, payout.ephemeralPublicKey).address, paid.intent.to);

  await chain.finalize();
  const checked = (await admin.post(`/payments/${paid.payment.id}/check`)).payment;
  assert.deepEqual([checked.status, checked.state, checked.amount, checked.from, checked.relayFee], ['confirmed', 'paid', paid.intent.amount, ENTRYPOINT, paid.quote.fee]);
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
await nil.stop();
await proxy.close();
services.close();
anvil.stop();
globalThis.curve_bn128?.terminate();
console.log(failed ? 'the pool check failed' : 'the pool check passed');
process.exit(failed ? 1 : 0);
