import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import verifierTag from '../chain/verifierTag.js';

const KEY = 'shadow-reasons-key-0123456789abcdef0123456789';
const HEAD = '0x60';
const FINAL = '0x5e';
const hashOf = (n) => `0x${n.replace(/^0x/, '').padStart(64, 'b')}`;

// A verifier that seals whatever `answer(method, params)` says: { proven: result },
// { unverified: reason }, "down" (no reply at all) or "no-seal". Every request is kept.
let answer = () => ({ unverified: 'syncing' });
const asked = [];
const verifier = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const { id, method, params } = JSON.parse(raw);
  asked.push({ method, params });
  const reply = answer(method, params);
  if (reply === 'down') return req.socket.destroy();
  if (reply === 'no-seal') return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: '0x1' }));
  const verdict = 'proven' in reply ? 'proven' : 'unverified';
  const body = JSON.stringify(verdict === 'proven' ? { jsonrpc: '2.0', id, result: reply.proven } : { jsonrpc: '2.0', id, error: { code: -32001, message: 'no', data: { reason: reply.unverified } } });
  res.setHeader('Nil-Verification', `${verdict} ${verifierTag(KEY, verdict, raw, body)}`);
  res.end(body);
});

// The usual verifier: proves its head and finalized block, and every read at them.
function honest(values = {}) {
  return (method, params) => {
    if (method === 'eth_blockNumber') return { proven: HEAD };
    if (method === 'eth_getBlockByNumber') {
      const n = params[0] === 'finalized' ? FINAL : params[0];
      return BigInt(n) > BigInt(HEAD) ? { unverified: 'out-of-range' } : { proven: { number: n, hash: hashOf(n) } };
    }
    return { proven: values[params[1]] ?? '0xaa' };
  };
}

let srv;
let sameState;
let sameBlock;
let shadowCheck;
let watchHead;
before(async () => {
  verifier.listen(0, '127.0.0.1');
  await once(verifier, 'listening');
  srv = await startServer({
    env: { NOX_VERIFIER_MODE: 'shadow', NOX_VERIFIER_KEY: KEY, NOX_VERIFIER_URL: `http://127.0.0.1:${verifier.address().port}`, NOX_VERIFIER_SHADOW_RETRY_MS: '10' },
  });
  ({ default: sameState } = await import('../chain/shadow/sameState.js'));
  ({ default: sameBlock } = await import('../chain/shadow/sameBlock.js'));
  ({ default: shadowCheck } = await import('../chain/shadowCheck.js'));
  ({ default: watchHead } = await import('../verifier/watchHead.js'));
});
after(async () => {
  await shadowCheck.idle();
  srv.close();
  verifier.close();
});

// What the server writes to stdout and stderr while `work` runs.
async function linesDuring(work) {
  const lines = [];
  const [out, err] = [process.stdout.write.bind(process.stdout), process.stderr.write.bind(process.stderr)];
  process.stdout.write = (chunk, ...rest) => (lines.push(String(chunk)), out(chunk, ...rest));
  process.stderr.write = (chunk, ...rest) => (lines.push(String(chunk)), err(chunk, ...rest));
  try {
    await work();
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
  return lines;
}

const checked = (method, params, result, node = async () => null) =>
  linesDuring(async () => {
    shadowCheck(method, params, { result }, node);
    await shadowCheck.idle();
  });

test('a read the verifier turns down is logged with its reason, and never with what was read', async () => {
  const address = `0x${'12'.repeat(20)}`;
  for (const [reply, reason] of [
    [{ unverified: 'syncing' }, 'syncing'],
    [{ unverified: 'timeout' }, 'timeout'],
    ['no-seal', 'no-seal'],
    ['down', 'unreachable'],
  ]) {
    answer = () => reply;
    const lines = await checked('eth_getBalance', [address, 'latest'], '0x1');
    const line = lines.find((l) => l.includes('couldn’t be checked'));
    assert.ok(line?.includes(`(${reason})`), `${reason}: ${lines.join('')}`);
    assert.ok(line.includes('WARN'), line);
    assert.ok(!line.includes(address.slice(2)), 'the address stays out of the log');
  }
});

test('a block too old to prove is expected: an info line, no warning', async () => {
  answer = (method) => (method === 'eth_getBlockReceipts' ? { unverified: 'out-of-range' } : { proven: HEAD });
  const lines = await checked('eth_getTransactionReceipt', [hashOf('aa')], { transactionHash: hashOf('aa'), blockHash: hashOf('a0'), status: '0x1', logs: [] });
  const line = lines.find((l) => l.includes('couldn’t be checked'));
  assert.ok(line?.includes('(out-of-range)') && line.includes('INFO'), lines.join(''));
  assert.ok(!lines.some((l) => l.includes('WARN')), lines.join(''));
});

test('an answer with nothing in it to check is left alone', async () => {
  answer = () => ({ unverified: 'syncing' });
  const lines = [...(await checked('eth_getLogs', [{}], [])), ...(await checked('eth_getTransactionReceipt', [hashOf('ab')], null))];
  assert.ok(!lines.some((l) => l.includes('couldn’t be checked')), lines.join(''));
});

test('a state read at a block ahead of the light client is asked again of both at its head', async () => {
  answer = honest({ [HEAD]: '0xcafe' });
  asked.length = 0;
  const nodeAsked = [];
  const node = async (method, params) => (nodeAsked.push(params[1]), '0xcafe');
  assert.equal(await sameState('eth_call', [{ to: '0x1' }, '0x64'], { result: '0xbeef' }, node), 'same');
  assert.deepEqual(nodeAsked, [HEAD]);
  assert.ok(!asked.some((a) => a.method === 'eth_call' && a.params[1] === '0x64'), 'the verifier isn’t asked for a block it doesn’t have');
});

test('a state read at a block older than the light client keeps falls back to its head too', async () => {
  const proving = honest({ [HEAD]: '0xcafe' });
  answer = (method, params) => (method === 'eth_call' && params[1] === '0x10' ? { unverified: 'out-of-range' } : proving(method, params));
  assert.equal(await sameState('eth_call', [{ to: '0x1' }, '0x10'], { result: '0xold' }, async () => '0xcafe'), 'same');
});

test('a lie at a block the verifier proves is still a lie, and so is one found at its head', async () => {
  answer = honest({ '0x50': '0xaa', [HEAD]: '0xaa' });
  assert.equal(await sameState('eth_call', [{ to: '0x1' }, '0x50'], { result: '0xbb' }, async () => '0xbb'), 'differs');
  assert.equal(await sameState('eth_call', [{ to: '0x1' }, '0x64'], { result: '0xbb' }, async () => '0xbb'), 'differs');
  assert.equal(await sameState('eth_call', [{ to: '0x1' }, 'latest'], { result: '0xaa' }, async () => '0xaa'), 'same');
});

test('a block ahead of the light client is checked at the finalized height instead', async () => {
  answer = honest();
  const node = async (method, params) => ({ number: params[0], hash: hashOf(params[0]) });
  assert.equal(await sameBlock('eth_getBlockByNumber', ['latest', false], { result: { number: '0x64', hash: hashOf('0x64') } }, node), 'same');
  const liar = async (method, params) => ({ number: params[0], hash: hashOf('0xdead') });
  assert.equal(await sameBlock('eth_getBlockByNumber', ['latest', false], { result: { number: '0x64', hash: hashOf('0x64') } }, liar), 'differs');
  // a height it has is checked as told
  assert.equal(await sameBlock('eth_getBlockByNumber', ['0x5f', false], { result: { number: '0x5f', hash: hashOf('0xdead') } }, node), 'differs');
});

test('a busy verifier is asked once more before giving up', async () => {
  let calls = 0;
  const proving = honest({ [HEAD]: '0xaa' });
  answer = (method, params) => (method === 'eth_call' && calls++ === 0 ? { unverified: 'busy' } : proving(method, params));
  assert.equal(await sameState('eth_call', [{ to: '0x1' }, HEAD], { result: '0xaa' }, async () => '0xaa'), 'same');
  assert.equal(calls, 2);
  answer = (method, params) => (method === 'eth_call' ? { unverified: 'busy' } : proving(method, params));
  assert.deepEqual(await sameState('eth_call', [{ to: '0x1' }, HEAD], { result: '0xaa' }, async () => '0xaa'), { reason: 'busy' });
});

test('a light client that aborts inside its WebAssembly code restarts the verifier', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-watch-'));
  let restarted = false;
  const state = { headAt: 0, client: { request: async () => { throw new WebAssembly.RuntimeError('unreachable'); } } };
  const watch = watchHead(state, { dataDir }, { fatal: () => (restarted = true) });
  await watch.first;
  watch.stop();
  assert.equal(restarted, true);
  // an ordinary failure only waits for the next try
  restarted = false;
  state.client.request = async () => { throw new Error('out of sync: 120 seconds behind'); };
  const again = watchHead(state, { dataDir }, { fatal: () => (restarted = true) });
  await again.first;
  again.stop();
  assert.equal(restarted, false);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
