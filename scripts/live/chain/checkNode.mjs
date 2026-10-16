// Read-only check of an Ethereum node against what Nil needs from it, for operators before they
// point NOX_RPC_URL at it: the mainnet contracts and their answers, the finalized tag, how far
// back it serves logs and state, smart-wallet signature checks, the tip it suggests and NOX's
// transfer fee. Sends nothing and spends nothing.
//
//   NOX_RPC_URL=https://your-node node scripts/live/chain/checkNode.mjs
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import mainnet from './mainnet.mjs';
import calls from './calls.mjs';
import sigValidatorCode from '../../../server/chain/sigValidatorCode.js';
import abiWithBytes from '../../../server/chain/abiWithBytes.js';
import personalHash from '../../../server/auth/personalHash.js';

const url = process.env.NOX_RPC_URL || 'https://ethereum-rpc.publicnode.com';
const word = (hex, i = 0) => (typeof hex === 'string' && hex.length >= 2 + (i + 1) * 64 ? BigInt(`0x${hex.slice(2 + i * 64, 2 + (i + 1) * 64)}`) : null);
let id = 0;
async function ask(method, params = []) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const body = await res.json().catch(() => null);
  return { ok: res.ok && body && !body.error, result: body?.result, error: body?.error?.message ?? (res.ok ? null : `HTTP ${res.status}`) };
}
const call = (to, data, block = 'latest') => ask('eth_call', [{ to, data }, block]);
let problems = 0;
const line = (good, label, detail = '') => {
  if (!good) problems++;
  console.log(`${good ? 'ok  ' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
};

const chainId = Number(BigInt((await ask('eth_chainId')).result ?? '0x0'));
line(chainId === Number(process.env.NOX_CHAIN_ID || 1), 'chain ID', String(chainId));
const head = Number(BigInt((await ask('eth_blockNumber')).result));
const finalized = await ask('eth_getBlockByNumber', ['finalized', false]);
line(finalized.ok && finalized.result, 'finalized tag', finalized.ok ? `${head - Number(BigInt(finalized.result.number))} blocks under the head` : finalized.error);

for (const [name, address] of Object.entries({ NOX: mainnet.nox, staking: mainnet.staking, 'Zero-State Pass': mainnet.zsp, USDC: mainnet.usdc, announcer: mainnet.announcer, 'ETH/USD feed': mainnet.ethUsdFeed })) {
  const code = await ask('eth_getCode', [address, 'latest']);
  line(code.ok && code.result !== '0x', `${name} contract at ${address}`);
}
const someone = mainnet.holders.zsp[0];
line(word((await call(mainnet.nox, `0x${calls.selector('decimals()')}`)).result) === 18n, 'NOX decimals() is 18');
const stake = await call(mainnet.staking, calls.getStakeInfo(someone));
line(word(stake.result) !== null, 'getStakeInfo(address) answers, staked amount first', stake.ok ? `${word(stake.result) / 10n ** 18n} NOX staked by ${someone}` : stake.error);
const passes = await call(mainnet.zsp, calls.balanceOf(someone));
line(word(passes.result) !== null, 'Zero-State Pass balanceOf(address)', passes.ok ? `${word(passes.result)} passes` : passes.error);
const round = await call(mainnet.ethUsdFeed, `0x${calls.selector('latestRoundData()')}`);
const age = round.ok ? Math.round(Date.now() / 60_000 - Number(word(round.result, 3)) / 60) : null;
line(round.ok && age < 120, 'Chainlink ETH/USD latestRoundData()', round.ok ? `$${Number(word(round.result, 1)) / 1e8}, ${age} minutes old` : round.error);
const reserves = await call(mainnet.noxWethV2Pair, `0x${calls.selector('getReserves()')}`);
line(reserves.ok, 'NOX/WETH Uniswap V2 pair getReserves()', reserves.ok ? `${word(reserves.result, 0) / 10n ** 18n} NOX, ${Number(word(reserves.result, 1)) / 1e18} WETH` : reserves.error);
const fees = await call(mainnet.nox, calls.fees());
const transferBps = word(fees.result, 2);
line(fees.ok && transferBps !== null, 'NOX fees()', fees.ok ? `${Number(transferBps) / 100}% on transfers between wallets${transferBps > 0n ? ': exact payments arrive short' : ''}` : fees.error);

// a plain signature through the EIP-6492 validator, run as an eth_call that deploys nothing
const key = secp256k1.utils.randomPrivateKey();
const address = `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`;
const digest = personalHash('Nil node check');
const sig = secp256k1.sign(digest, key);
const signature = `${calls.word(sig.r)}${calls.word(sig.s)}${(sig.recovery + 27).toString(16)}`;
const validated = await ask('eth_call', [{ data: `0x${sigValidatorCode}${abiWithBytes([address, bytesToHex(digest)], signature)}` }, 'latest']);
line(validated.result === '0x01', 'EIP-6492 validator runs as a deployless eth_call (smart-wallet sign-in)', validated.error ?? validated.result);

const tip = await ask('eth_maxPriorityFeePerGas');
line(tip.ok, 'eth_maxPriorityFeePerGas', tip.ok ? `${Number(BigInt(tip.result)) / 1e9} gwei${BigInt(tip.result) === 0n ? ' (zero; Nil adds STEALTH_MIN_TIP_WEI)' : ''}` : tip.error);

// how far back the node answers: logs for the treasury scan, state for vote snapshots
let logDepth = 0;
for (const depth of [1_000, 5_000, 10_000, 50_000, 200_000, 1_000_000]) {
  const logs = await ask('eth_getLogs', [{ address: mainnet.usdc, topics: [null, null, `0x${calls.word(mainnet.announcer)}`], fromBlock: `0x${(head - depth).toString(16)}`, toBlock: `0x${(head - depth + 100).toString(16)}` }]);
  if (!logs.ok) break;
  logDepth = depth;
}
line(logDepth >= 10_000, 'eth_getLogs history', `answers at least ${logDepth} blocks back; set NOX_LOG_HISTORY_BLOCKS to that or less`);
let stateDepth = 0;
for (const depth of [16, 64, 120, 256, 1_000, 100_000]) {
  if (!(await call(mainnet.nox, calls.balanceOf(someone), `0x${(head - depth).toString(16)}`)).ok) break;
  stateDepth = depth;
}
line(stateDepth >= 16, 'state for past blocks', `answers at least ${stateDepth} blocks back`);

console.log(problems ? `${problems} problem(s) with ${url}` : `${url} has everything Nil needs`);
process.exit(problems ? 1 : 0);
