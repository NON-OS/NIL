// Runs Nil's verifier, with the real Helios light client, against Ethereum mainnet and checks
// that it proves real answers and refuses tampered ones. The execution node sits behind a small
// proxy that can rewrite its answers, the way a lying RPC provider would.
//
// Usage: npm run verifier:mainnet-check
//   VERIFIER_EXECUTION_RPC   execution node with eth_getProof for recent blocks
//                            (default https://eth.drpc.org; ethereum-rpc.publicnode.com keeps no proof window)
//   VERIFIER_CONSENSUS_RPC   beacon API with light-client endpoints (default ethereum-beacon-api.publicnode.com)
//   CHECKPOINT_CROSS_CHECK   a second beacon API that must agree on the checkpoint (default lodestar-mainnet.chainsafe.io)
// Exits 1 when any check fails.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import startVerifier from '../../server/verifier/startVerifier.js';
import verifierTag from '../../server/chain/verifierTag.js';

const EXECUTION = process.env.VERIFIER_EXECUTION_RPC || 'https://eth.drpc.org';
const CONSENSUS = process.env.VERIFIER_CONSENSUS_RPC || 'https://ethereum-beacon-api.publicnode.com';
const CROSS_CHECK = process.env.CHECKPOINT_CROSS_CHECK || 'https://lodestar-mainnet.chainsafe.io';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// the beacon chain deposit contract: a large, well-known ETH balance
const DEPOSIT = '0x00000000219ab540356cbb839cbe05303d7705fa';
const KEY = crypto.randomBytes(32).toString('hex');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function finalizedRoot(base) {
  const res = await fetch(`${base}/eth/v1/beacon/headers/finalized`, { signal: AbortSignal.timeout(15_000) });
  return (await res.json()).data.root;
}

async function plain(method, params) {
  const res = await fetch(EXECUTION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return (await res.json()).result;
}

// One word of hex flipped in the last place: still well formed, no longer true.
const bend = (hex) => hex.slice(0, -1) + (hex.at(-1) === '0' ? '1' : '0');

// The lying execution node: passes everything through, except what `tamper` rewrites.
let tamper = null;
const proxy = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString());
  const upstream = await fetch(EXECUTION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  let reply = await upstream.json();
  const rewrite = (one) => (tamper && one.result !== undefined ? { ...one, result: tamper(one.method ?? request.method, one.result, request) ?? one.result } : one);
  reply = Array.isArray(reply) ? reply.map((one, i) => rewrite({ ...one, method: request[i]?.method })) : rewrite(reply);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(reply, (k, v) => (k === 'method' ? undefined : v)));
});
proxy.listen(0, '127.0.0.1');
await once(proxy, 'listening');

const checkpoint = await finalizedRoot(CONSENSUS);
const second = await finalizedRoot(CROSS_CHECK).catch(() => null);
check('two beacon APIs agree on the checkpoint', second === null || second === checkpoint, `${checkpoint}${second === null ? ', second API unreachable' : ''}`);
if (second !== null && second !== checkpoint) process.exit(1);

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-verifier-mainnet-'));
const config = {
  executionRpc: `http://127.0.0.1:${proxy.address().port}`,
  consensusRpc: CONSENSUS,
  network: 'mainnet',
  checkpoint,
  checkpointMaxAgeMs: 14 * 86_400_000,
  key: KEY,
  host: '127.0.0.1',
  port: 0,
  dataDir,
  timeoutMs: 30_000,
  maxHeadAgeMs: 120_000,
  retryMs: 30_000,
  maxConcurrent: 16,
  maxBodyBytes: 256 * 1024,
};
const started = Date.now();
const verifier = await startVerifier({ config });
for (let i = 0; i < 600 && verifier.state.phase !== 'ready'; i++) await new Promise((r) => setTimeout(r, 100));
check('the light client synced from the checkpoint', verifier.state.phase === 'ready', `${Date.now() - started} ms, ${Math.round(process.memoryUsage().rss / 1e6)} MB resident`);
const url = `http://127.0.0.1:${verifier.server.address().port}`;

async function ask(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const text = await res.text();
  const [verdict, tag] = (res.headers.get('nil-verification') ?? '').split(' ');
  return { verdict, sealed: tag === verifierTag(KEY, verdict, body, text), reply: JSON.parse(text) };
}

try {
  // a real USDC transfer from a finalized block, found through the verifier itself
  const final = (await ask('eth_getBlockByNumber', ['finalized', false])).reply.result;
  check('the finalized block is proven', Boolean(final?.hash), final ? `block ${Number(final.number)}` : '');
  const logs = await ask('eth_getLogs', [{ address: USDC, topics: [TRANSFER], fromBlock: final.number, toBlock: final.number }]);
  check('USDC Transfer logs in that block are proven', logs.verdict === 'proven' && logs.sealed && logs.reply.result.length > 0, `${logs.reply.result?.length ?? 0} logs`);
  const hash = logs.reply.result[0].transactionHash;
  const receipt = await ask('eth_getTransactionReceipt', [hash]);
  const usdc = receipt.reply.result?.logs?.find((l) => l.address.toLowerCase() === USDC && l.topics[0] === TRANSFER);
  check('a real USDC Transfer receipt is proven', receipt.verdict === 'proven' && receipt.sealed && receipt.reply.result.status === '0x1' && Boolean(usdc), `${hash}, ${usdc ? BigInt(usdc.data) : '?'} units`);

  const head = (await ask('eth_blockNumber', [])).reply.result;
  const balance = await ask('eth_getBalance', [DEPOSIT, head]);
  const truth = await plain('eth_getBalance', [DEPOSIT, head]);
  check('a real ETH balance is proven and matches the node', balance.verdict === 'proven' && balance.sealed && BigInt(balance.reply.result) === BigInt(truth), `${BigInt(balance.reply.result ?? 0) / 10n ** 18n} ETH at block ${Number(head)}`);
  const held = await ask('eth_call', [{ to: USDC, data: `0x70a08231${DEPOSIT.slice(2).padStart(64, '0')}` }, head]);
  check('a real USDC balanceOf call is proven', held.verdict === 'proven' && held.sealed && /^0x[0-9a-f]{64}$/.test(held.reply.result ?? ''));

  // one block earlier, so Helios has no proof cached and has to take the node's word for it
  const earlier = `0x${(BigInt(head) - 1n).toString(16)}`;
  tamper = (method, result) => (method === 'eth_getProof' ? { ...result, balance: `0x${(BigInt(result.balance) + 10n ** 21n).toString(16)}` } : null);
  const fakeBalance = await ask('eth_getBalance', [DEPOSIT, earlier]);
  check('a tampered balance is refused', fakeBalance.verdict === 'unverified' && fakeBalance.sealed && fakeBalance.reply.result === undefined, fakeBalance.reply.error?.data?.reason);

  tamper = (method, result) => (method === 'eth_getProof' ? { ...result, storageProof: result.storageProof.map((p) => ({ ...p, value: bend(p.value === '0x0' ? '0x1' : p.value) })) } : null);
  const fakeCall = await ask('eth_call', [{ to: USDC, data: `0x70a08231${DEPOSIT.slice(2).padStart(64, '0')}` }, earlier]);
  check('a tampered token balance is refused', fakeCall.verdict === 'unverified' && fakeCall.reply.result === undefined, fakeCall.reply.error?.data?.reason);

  const bendLogs = (list) => list.map((l) => (l.address?.toLowerCase() === USDC ? { ...l, data: bend(l.data) } : l));
  tamper = (method, result) => {
    if (method === 'eth_getTransactionReceipt' && result) return { ...result, logs: bendLogs(result.logs) };
    if (method === 'eth_getBlockReceipts' && Array.isArray(result)) return result.map((r) => ({ ...r, logs: bendLogs(r.logs) }));
    return null;
  };
  const fakeReceipt = await ask('eth_getTransactionReceipt', [hash]);
  check('a tampered receipt (amount changed) is refused', fakeReceipt.verdict === 'unverified' && fakeReceipt.reply.result === undefined, fakeReceipt.reply.error?.data?.reason);

  tamper = (method, result) => (method === 'eth_getLogs' && Array.isArray(result) ? bendLogs(result) : null);
  const fakeLogs = await ask('eth_getLogs', [{ address: USDC, topics: [TRANSFER], fromBlock: final.number, toBlock: final.number }]);
  check('a tampered Transfer log is refused', fakeLogs.verdict === 'unverified' && fakeLogs.reply.result === undefined, fakeLogs.reply.error?.data?.reason);

  // a receipt for a payment that never happened, copied from a real one
  const invented = `0x${crypto.randomBytes(32).toString('hex')}`;
  const real = receipt.reply.result;
  tamper = (method, result, request) => (method === 'eth_getTransactionReceipt' && request.params?.[0] === invented ? { ...real, transactionHash: invented, logs: real.logs.map((l) => ({ ...l, transactionHash: invented })) } : null);
  const fakeTx = await ask('eth_getTransactionReceipt', [invented]);
  // Helios rebuilds the block's receipts and finds no such transaction, so it says "not found":
  // the payment would wait, never be credited
  check('an invented receipt is never accepted', ['unverified', 'absent'].includes(fakeTx.verdict) && fakeTx.sealed && !fakeTx.reply.result, fakeTx.verdict === 'absent' ? 'came back as absent' : fakeTx.reply.error?.data?.reason);
  tamper = null;
} finally {
  await verifier.close();
  proxy.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
