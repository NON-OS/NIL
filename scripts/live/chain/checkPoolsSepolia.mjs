// The Privacy Pools check on Sepolia, against 0xbow's own testnet relayer and association set
// provider: Nil verifies a bounty paid from a team pool on a public chain. It keeps a throwaway
// test key in --dir (default: a folder in the system temp directory), never prints it, and
// prints only its address, for funding with Sepolia ETH and Circle's test USDC. Without funds it
// runs every step that needs none and says what's left; run it again once the address is funded.
//
// With --swap, a wallet holding ETH but too little USDC swaps 0.0005 ETH for it on Uniswap first.
//
//   node --experimental-strip-types --import ./scripts/test/registerTs.mjs scripts/live/chain/checkPoolsSepolia.mjs [--dir path] [--swap]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { mapHashToField } from '@noble/curves/abstract/modular';
import { Group } from '@semaphore-protocol/group';
import rpcClient from './rpcClient.mjs';
import devChain from './devChain.mjs';
import testWallet from './testWallet.mjs';
import bootNil from './bootNil.mjs';
import nilClient from './nilClient.mjs';
import stealthKeys from './stealthKeys.mjs';
import calls from './calls.mjs';
import poolSteps from './pools/poolSteps.mjs';
import swapForUsdc from './pools/swapForUsdc.mjs';
import newStealthPayment from '../../../client/src/lib/stealth/newStealthPayment.ts';

const USDC = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';
const WANT = { eth: 2n * 10n ** 16n, usdc: 10_000_000n };
const BOUNTY = 1_000_000n;
const SWAP_ETH = 5n * 10n ** 14n;
// a Sepolia block takes about 12 seconds; receipts are looked for every 100 ms for five minutes
const RECEIPT_TRIES = 3000;
// how long Check for the payout keeps looking for a relay the relayer didn't confirm
const FIND_FOR_MS = 5 * 60_000;
const RPC = process.env.LIVE_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const dir = path.resolve(process.argv.includes('--dir') ? arg('--dir') : path.join(os.tmpdir(), 'nil-pools-sepolia'));
const waitMinutes = Number(process.env.LIVE_POOLS_WAIT_MINUTES || 20);
const step = (what) => console.log(`  ${what}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(path.join(dir, 'nil'), { recursive: true, mode: 0o700 });
const keyFile = path.join(dir, 'test-key.json');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, JSON.stringify({ key: bytesToHex(secp256k1.utils.randomPrivateKey()) }), { mode: 0o600 });
const root = hexToBytes(JSON.parse(fs.readFileSync(keyFile, 'utf8')).key);
const derive = (label, length = 32) => hkdf(sha256, root, utf8ToBytes('nil/live-pools-sepolia'), utf8ToBytes(label), length);
const scalar = (label) => mapHashToField(derive(label, 48), secp256k1.CURVE.n);

const rpc = rpcClient(RPC);
const local = devChain(rpc);
const chain = { ...local, receipt: (hash) => local.receipt(hash, { tries: RECEIPT_TRIES }) };
const owner = testWallet(rpc, root);
const member = testWallet(rpc, scalar('contributor'));
const spending = scalar('stealth spending');
const viewing = scalar('stealth viewing');
console.log(`Test wallet (fund this on Sepolia): ${owner.address}`);

const nil = await bootNil({
  rpcUrl: RPC,
  port: Number(process.env.LIVE_SEPOLIA_PORT || 3911),
  dataDir: path.join(dir, 'nil'),
  env: { NOX_CHAIN_ID: '11155111', NOX_TOKEN: USDC, NOX_SYMBOL: 'USDC', NOX_DECIMALS: '6', REWARD_TOKENS: 'none', NOX_STAKING: 'off', ZSP_CONTRACT: 'off', PRIVACY_POOLS: 'on' },
});
console.log(`Nil at ${nil.base}, server log ${nil.logFile}`);

let failed = false;
try {
  const admin = nilClient(nil.base, { chainId: 11155111 });
  const contributor = nilClient(nil.base, { chainId: 11155111 });
  const fresh = !(await admin.get('/auth/state')).workspace;
  if (fresh) {
    await admin.wallet(owner, 'setup', { name: 'Erik', workspaceName: 'Pools Sepolia' });
    const invite = await admin.post('/invites', { role: 'member' });
    await contributor.wallet(member, 'invite', { name: 'Mia', inviteToken: invite.token });
  } else {
    await admin.wallet(owner, 'login');
    await contributor.wallet(member, 'login');
  }
  const meta = stealthKeys.meta(spending, viewing);
  await contributor.put('/me/stealth', { metaAddress: meta });
  const miaId = (await contributor.get('/bootstrap')).me.id;

  const info = await admin.get('/pools');
  const usdc = info.assets.find((a) => a.symbol === 'USDC');
  assert.equal(usdc.pool, '0x0b062fe33c4f1592d8ea63f9a0177fca44374c0f');
  step(`Nil reads 0xbow's Sepolia USDC pool: minimum ${Number(usdc.minimumDeposit) / 1e6} USDC, vetting fee ${usdc.vettingFeeBps} bps, relay cap ${usdc.maxRelayFeeBps} bps`);

  // the sets come from 0xbow's testnet provider; both trees must rebuild the chain's roots
  const sets = await admin.get('/pools/USDC/sets');
  assert.equal(new Group(sets.aspLeaves.map(BigInt)).root.toString(), sets.aspRoot);
  assert.equal(new Group(sets.stateLeaves.map(BigInt)).root.toString(), sets.stateRoot);
  step(`0xbow's association set (${sets.aspLeaves.length} labels) and the pool tree (${sets.stateLeaves.length} leaves) rebuild the on-chain roots`);

  const pool = poolSteps({ api: admin, chain, wallet: owner, info, findForMs: FIND_FOR_MS, key: derive('pool key', 16), seed: derive('identity') });
  await pool.open();

  // a quote from 0xbow's testnet relayer for a real pool intent costs nothing
  const task = (await admin.post('/tasks', { title: `Pool bounty ${new Date().toISOString()}`, assigneeId: miaId, bounty: String(BOUNTY), status: 'done' })).task;
  const probe = await admin.post(`/tasks/${task.id}/payments/intent`, { stealth: newStealthPayment(meta), via: 'pool' });
  const { quote } = await admin.post(`/pool-payouts/${probe.intent.id}/quote`);
  step(`0xbow's relayer quotes ${quote.feeBps} bps${quote.extraGas ? ' with extra gas' : ''}: withdraw ${quote.gross} for ${probe.intent.amount} to arrive, terms checked by Nil`);

  const usdcHeld = async () => BigInt(await rpc('eth_call', [{ to: USDC, data: calls.balanceOf(owner.address) }, 'latest']));
  const eth = BigInt(await rpc('eth_getBalance', [owner.address, 'latest']));
  let held = await usdcHeld();
  if (process.argv.includes('--swap') && held < WANT.usdc && eth >= WANT.eth) {
    const swapped = await swapForUsdc({ rpc, wallet: owner, chain, usdc: USDC, ethIn: SWAP_ETH, least: WANT.usdc - held + 1_000_000n });
    held = await usdcHeld();
    step(`swapped ${Number(SWAP_ETH) / 1e18} ETH for test USDC on Uniswap (quoted ${Number(swapped.quoted) / 1e6}): ${swapped.hash}`);
  }
  let note = pool.book().notes.find((n) => n.state === 'open' && BigInt(n.value) > BOUNTY * 2n);
  if (!note && (eth < WANT.eth || held < WANT.usdc)) {
    step(`not funded yet: ${owner.address} holds ${Number(eth) / 1e18} ETH and ${Number(held) / 1e6} USDC; it needs ${Number(WANT.eth) / 1e18} Sepolia ETH and ${Number(WANT.usdc) / 1e6} Sepolia USDC (Circle, ${USDC})`);
    step('left to run once funded: deposit, association set approval, the relayed payout, Nil crediting it once final, and a ragequit of the rest');
  } else {
    if (!note) {
      const deposit = await pool.deposit(WANT.usdc);
      step(`deposited ${Number(WANT.usdc) / 1e6} USDC, credited ${Number(deposit.value) / 1e6}, tx ${deposit.hash}`);
      note = pool.book().notes.find((n) => n.label === deposit.label);
    }
    let approved = false;
    for (let i = 0; i <= waitMinutes && !approved; i++) {
      approved = (await admin.get('/pools/USDC/sets')).aspLeaves.includes(note.label);
      if (!approved && i < waitMinutes) await sleep(60_000);
    }
    if (!approved) step(`the deposit isn’t in 0xbow's association set after ${waitMinutes} minutes; run again later to pay from it`);
    else {
      const paid = await pool.pay(task, meta);
      step(`relayed by 0xbow's testnet relayer: ${paid.payment.txHash} (proved in ${(paid.provingMs / 1000).toFixed(1)} s)`);
      if (paid.recovered) step(`the relayer reported a failure, but the withdrawal went out and was recorded for the same payout: ${paid.recovered}`);
      let payment = paid.payment;
      for (let i = 0; i < 40 && payment.status !== 'confirmed'; i++) {
        await sleep(60_000);
        payment = (await admin.post(`/payments/${payment.id}/check`)).payment;
      }
      assert.deepEqual([payment.status, payment.state, payment.amount], ['confirmed', 'paid', paid.intent.amount]);
      step(`Nil verified and credited ${Number(payment.amount) / 1e6} USDC once final; relayer kept ${payment.relayFee}`);
      const rest = pool.book().notes.find((n) => n.label === note.label);
      step(`ragequit of the remaining ${Number(rest.value) / 1e6} USDC: ${await pool.ragequit(rest)}`);
    }
  }
} catch (err) {
  failed = true;
  console.log(`FAIL  ${err.stack ?? err}`);
}
await nil.stop();
globalThis.curve_bn128?.terminate();
console.log(failed ? 'the Sepolia pool check failed' : 'the Sepolia pool check ran');
process.exit(failed ? 1 : 0);
