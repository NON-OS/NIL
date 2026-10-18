import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mockChain from './helpers/mockChain.js';
import testVerifier from './helpers/testVerifier.js';
import verifierTag from '../chain/verifierTag.js';
import heliosFailure from '../verifier/heliosFailure.js';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const PAYER = '0x1111111111111111111111111111111111111111';
const PAYEE = '0x2222222222222222222222222222222222222222';
const HASH = `0x${'aa'.repeat(32)}`;

const chain = mockChain();
let v;
let nextId = 1;

before(async () => {
  chain.server.listen(0);
  await once(chain.server, 'listening');
  v = await testVerifier(`http://127.0.0.1:${chain.server.address().port}`);
});
after(async () => {
  await v.close();
  chain.server.close();
});

// One raw request, and what came back: status, the verdict and whether its seal checks out.
async function ask(method, params = [], { body } = {}) {
  const request = body ?? JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
  const res = await fetch(v.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request });
  const text = await res.text();
  const [verdict, tag] = (res.headers.get('nil-verification') ?? '').split(' ');
  return { status: res.status, verdict, sealed: Boolean(tag) && tag === verifierTag(testVerifier.KEY, verdict, request, text), reply: text ? JSON.parse(text) : null, text, request, tag };
}

test('a proven answer is sealed over the request, the verdict and the reply, so no byte of it can change', async () => {
  chain.setEthBalance(PAYER, 5n * 10n ** 18n);
  const balance = await ask('eth_getBalance', [PAYER, 'latest']);
  assert.equal(balance.verdict, 'proven');
  assert.ok(balance.sealed);
  // Helios gives a balance as a decimal string; the reply has it as JSON-RPC hex
  assert.equal(balance.reply.result, `0x${(5n * 10n ** 18n).toString(16)}`);

  const forged = balance.text.replace(balance.reply.result, '0x1');
  assert.notEqual(verifierTag(testVerifier.KEY, 'proven', balance.request, forged), balance.tag);
  assert.notEqual(verifierTag(testVerifier.KEY, 'relayed', balance.request, balance.text), balance.tag);
  assert.notEqual(verifierTag('another-key-of-at-least-32-characters!!', 'proven', balance.request, balance.text), balance.tag);
});

test('receipts and logs come back proven, and a receipt the node says it lacks is only "absent"', async () => {
  chain.addTransfer({ hash: HASH, token: USDC, from: PAYER, to: PAYEE, value: '1000000', depth: 3 });
  const receipt = await ask('eth_getTransactionReceipt', [HASH]);
  assert.equal(receipt.verdict, 'proven');
  assert.equal(receipt.reply.result.logs.length, 1);
  const logs = await ask('eth_getLogs', [{ address: USDC, fromBlock: '0x1', toBlock: `0x${chain.head().toString(16)}` }]);
  assert.equal(logs.verdict, 'proven');
  assert.equal(logs.reply.result.length, 1);

  const missing = await ask('eth_getTransactionReceipt', [`0x${'bb'.repeat(32)}`]);
  assert.equal(missing.verdict, 'absent');
  assert.ok(missing.sealed);
  assert.equal(missing.reply.result, null);
});

test('an answer the light client finds false never reaches the app: it is refused with the reason', async () => {
  v.client.lies = (method) => method === 'eth_getTransactionReceipt' || method === 'eth_getBalance';
  try {
    for (const [method, params] of [['eth_getTransactionReceipt', [HASH]], ['eth_getBalance', [PAYER, 'latest']]]) {
      const lie = await ask(method, params);
      assert.equal(lie.verdict, 'unverified');
      assert.ok(lie.sealed);
      assert.equal(lie.reply.result, undefined);
      assert.equal(lie.reply.error.data.reason, 'mismatch');
    }
  } finally {
    v.client.lies = () => false;
  }
});

test('a revert is the contract saying no, proven like any answer', async () => {
  chain.breakContract(USDC);
  try {
    const call = await ask('eth_call', [{ to: USDC, data: '0x70a08231' }, 'latest']);
    assert.equal(call.verdict, 'proven');
    assert.equal(call.reply.error.code, 3);
    assert.match(call.reply.error.message, /reverted/);
  } finally {
    chain.fixContract(USDC);
  }
});

test('sending, gas and the pending nonce are relayed as unproven; the latest nonce is proven', async () => {
  const before = v.client.requests.length;
  for (const [method, params] of [['eth_sendRawTransaction', ['0x02f8']], ['eth_estimateGas', [{ from: PAYER, to: PAYEE }]], ['eth_maxPriorityFeePerGas', []], ['eth_getTransactionCount', [PAYER, 'pending']]]) {
    const relayed = await ask(method, params);
    assert.equal(relayed.verdict, 'relayed', method);
    assert.ok(relayed.sealed);
  }
  // none of those went through the light client
  assert.equal(v.client.requests.length, before);
  assert.equal((await ask('eth_getTransactionCount', [PAYER, 'latest'])).verdict, 'proven');
});

test('anything it can’t prove is refused rather than passed on', async () => {
  for (const [method, params] of [['eth_accounts', []], ['eth_sign', [PAYER, '0x00']], ['debug_traceTransaction', [HASH]], ['eth_getBalance', [PAYER, 'pending']]]) {
    const refused = await ask(method, params);
    assert.equal(refused.verdict, 'unverified', method);
    assert.ok(refused.sealed);
    assert.ok(refused.reply.error);
  }
  const batch = await ask(null, null, { body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }]) });
  assert.equal(batch.reply.error.code, -32600);
  const junk = await ask(null, null, { body: '{not json' });
  assert.equal(junk.reply.error.code, -32700);
  assert.equal(junk.verdict, 'unverified');
  const huge = await fetch(v.url, { method: 'POST', body: 'x'.repeat(v.config.maxBodyBytes + 1) });
  assert.equal(huge.status, 413);
  assert.equal((await fetch(`${v.url}/other`, { method: 'POST', body: '{}' })).status, 404);
});

test('a light client that is behind, busy or slow says so, and its health shows it', async () => {
  const ready = await fetch(`${v.url}/healthz`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).ok, true);

  const headAt = v.state.headAt;
  v.state.headAt = Date.now() - v.config.maxHeadAgeMs - 1000;
  try {
    assert.equal((await ask('eth_blockNumber')).reply.error.data.reason, 'syncing');
    const health = await fetch(`${v.url}/healthz`);
    assert.equal(health.status, 503);
    assert.equal((await health.json()).reason, 'syncing');
  } finally {
    v.state.headAt = headAt;
  }

  v.state.inFlight = v.config.maxConcurrent;
  try {
    assert.equal((await ask('eth_blockNumber')).reply.error.data.reason, 'busy');
  } finally {
    v.state.inFlight = 0;
  }

  const slow = v.client.request;
  v.client.request = (req) => (req.method === 'eth_call' ? new Promise(() => {}) : slow(req));
  try {
    assert.equal((await ask('eth_call', [{ to: USDC, data: '0x18160ddd' }, 'latest'])).reply.error.data.reason, 'timeout');
  } finally {
    v.client.request = slow;
  }
});

test('Helios’s own failures map to a reason the app can act on', () => {
  // messages as Helios 0.12.0 words them against mainnet
  assert.equal(heliosFailure(new Error('Error: block 26209767 is outside EIP-2935 ring buffer range (latest: 26218767, buffer size: 8191)')), 'out-of-range');
  assert.equal(heliosFailure(new Error('Error: evm error: "server returned an error response: error code -32602: distance to target block exceeds maximum proof window"')), 'upstream');
  assert.equal(heliosFailure(new Error('Error: receipt root mismatch for tx: 0xabc')), 'mismatch');
  assert.equal(heliosFailure(new Error('Error: evm error: "invalid account proof for address: 0xabc"')), 'mismatch');
  assert.equal(heliosFailure(new Error('Error: missing log for transaction: 0xabc')), 'mismatch');
  assert.equal(heliosFailure(new Error('Error: checkpoint is too old')), 'checkpoint');
  assert.equal(heliosFailure(new Error('Error: out of sync: 300 seconds behind')), 'syncing');
  assert.equal(heliosFailure(new Error('something nobody planned for')), 'upstream');
});
