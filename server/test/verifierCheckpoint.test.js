import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import headerRoot from '../verifier/headerRoot.js';
import checkpointSlot from '../verifier/checkpointSlot.js';
import chooseCheckpoint from '../verifier/chooseCheckpoint.js';
import checkpointFile from '../verifier/checkpointFile.js';
import startVerifier from '../verifier/startVerifier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DAY = 86_400_000;
const GENESIS = 1606824023;
// a finalized mainnet block header from 18 October 2026, and its root, as a beacon node serves them
const HEADER = {
  slot: '15457792',
  proposer_index: '1837715',
  parent_root: '0xc0cf14da0941bfb1418906e8e6b7f29f425fee07a11919c7016c45f4ac812011',
  state_root: '0x0eb6321caf8fb72098a519b984fbdf5bfeb9386ec86c263dd8f7cc6054473912',
  body_root: '0x58e5ab1c8cf2fe80350a5c63f30d5b5f14626640805371fad0a58db7b2328a92',
};
const CHECKPOINT = '0xdfbe9257e6cdcb29937dbfb0fed314051e6334b7215e3f3fab81968a2cb9c859';
const slotTime = (slot) => (GENESIS + slot * 12) * 1000;

async function beacon(answer) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: { header: { beacon: answer(req.url) } } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('a beacon block header hashes to its own checkpoint root', () => {
  assert.equal(headerRoot(HEADER), CHECKPOINT);
  assert.notEqual(headerRoot({ ...HEADER, slot: '15457793' }), CHECKPOINT);
});

test('a checkpoint’s slot is taken only from a header that hashes to it', async () => {
  const honest = await beacon(() => HEADER);
  const lying = await beacon(() => ({ ...HEADER, slot: String(Number(HEADER.slot) + 100_000) }));
  try {
    assert.equal(await checkpointSlot(honest.url, CHECKPOINT, { timeoutMs: 2000 }), 15457792);
    // a consensus node that makes an old checkpoint look newer is caught
    await assert.rejects(checkpointSlot(lying.url, CHECKPOINT, { timeoutMs: 2000 }), /isn’t the checkpoint’s/);
  } finally {
    honest.close();
    lying.close();
  }
});

test('the newest checkpoint wins, and one past the allowed age is refused outright', async () => {
  const slots = { [`0x${'01'.repeat(32)}`]: 100, [`0x${'02'.repeat(32)}`]: 200 };
  const slotOf = async (c) => {
    if (!(c in slots)) throw new Error('unknown root');
    return slots[c];
  };
  const fresh = await chooseCheckpoint({ candidates: Object.keys(slots), slotOf, genesisTime: GENESIS, maxAgeMs: 14 * DAY, now: slotTime(200) + DAY });
  assert.equal(fresh.slot, 200);
  assert.equal(fresh.ageMs, DAY);

  await assert.rejects(chooseCheckpoint({ candidates: Object.keys(slots), slotOf, genesisTime: GENESIS, maxAgeMs: 14 * DAY, now: slotTime(200) + 15 * DAY }), (err) => err.reason === 'checkpoint' && /15 days old/.test(err.message));
  await assert.rejects(chooseCheckpoint({ candidates: [null], slotOf, genesisTime: GENESIS, maxAgeMs: 14 * DAY }), (err) => err.reason === 'checkpoint');
  await assert.rejects(chooseCheckpoint({ candidates: [`0x${'03'.repeat(32)}`], slotOf, genesisTime: GENESIS, maxAgeMs: 14 * DAY }), (err) => err.reason === 'consensus');
});

test('the checkpoint reached last time is kept on disk and used when it is newer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-checkpoint-'));
  try {
    assert.equal(checkpointFile.read(dir), null);
    checkpointFile.write(dir, 'not a root');
    assert.equal(checkpointFile.read(dir), null);
    checkpointFile.write(dir, CHECKPOINT);
    assert.equal(checkpointFile.read(dir), CHECKPOINT);
    assert.equal(fs.statSync(path.join(dir, 'checkpoint')).mode & 0o777, 0o600);
    const chosen = await chooseCheckpoint({ candidates: [`0x${'01'.repeat(32)}`, checkpointFile.read(dir)], slotOf: async (c) => (c === CHECKPOINT ? 15457792 : 1), genesisTime: GENESIS, maxAgeMs: 14 * DAY, now: slotTime(15457792) + DAY });
    assert.equal(chosen.checkpoint, CHECKPOINT);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('with a checkpoint that is too old the light client never starts, and every read is refused saying why', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-verifier-'));
  let opened = false;
  const config = { executionRpc: 'http://127.0.0.1:9', consensusRpc: 'http://127.0.0.1:9', network: 'mainnet', checkpoint: CHECKPOINT, checkpointMaxAgeMs: 14 * DAY, key: 'k'.repeat(32), host: '127.0.0.1', port: 0, dataDir, timeoutMs: 1000, maxHeadAgeMs: 60_000, retryMs: 60_000, maxConcurrent: 4, maxBodyBytes: 16_384 };
  const oldSlot = Math.floor(((Date.now() - 20 * DAY) / 1000 - GENESIS) / 12);
  const verifier = await startVerifier({ config, slotOf: async () => oldSlot, openClient: async () => (opened = true) });
  try {
    for (let i = 0; i < 100 && verifier.state.phase !== 'down'; i++) await new Promise((r) => setTimeout(r, 10));
    const url = `http://127.0.0.1:${verifier.server.address().port}`;
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [`0x${'aa'.repeat(32)}`] }) });
    const reply = await res.json();
    assert.equal(reply.error.data.reason, 'checkpoint');
    assert.equal(res.headers.get('nil-verification').split(' ')[0], 'unverified');
    const health = await fetch(`${url}/healthz`);
    assert.equal(health.status, 503);
    assert.equal((await health.json()).reason, 'checkpoint');
    assert.equal(opened, false);
  } finally {
    await verifier.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('the verifier refuses to start without its key, and never allows a checkpoint older than two weeks', () => {
  const run = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', "const { default: c } = await import('./server/config/verifier.js'); console.log(JSON.stringify({ age: c.checkpointMaxAgeMs }))"], { cwd: ROOT, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  const base = { VERIFIER_EXECUTION_RPC: 'http://reth:8545', VERIFIER_CONSENSUS_RPC: 'http://lighthouse:5052', VERIFIER_KEY: 'k'.repeat(32) };
  assert.equal(run({ ...base, VERIFIER_KEY: 'short' }).status, 1);
  assert.equal(run({ ...base, VERIFIER_CONSENSUS_RPC: '' }).status, 1);
  assert.equal(run({ ...base, VERIFIER_CHECKPOINT: '0x1234' }).status, 1);
  const loose = run({ ...base, VERIFIER_CHECKPOINT_MAX_AGE_DAYS: '30' });
  assert.equal(loose.status, 0);
  assert.equal(JSON.parse(loose.stdout).age, 14 * DAY);
  assert.match(loose.stderr, /VERIFIER_CHECKPOINT_MAX_AGE_DAYS=30/);
});
