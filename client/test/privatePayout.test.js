import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hexToBytes } from '@noble/hashes/utils';

const [payee] = JSON.parse(fs.readFileSync(new URL('../../server/test/fixtures/stealthVectors.json', import.meta.url)));
const ADMIN = `0x${'a1'.repeat(20)}`;
const ANA = `0x${'b2'.repeat(20)}`;
const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const ANNOUNCER = '0x55649e01b5df198d18d95b5cc5051630cfd45564';
const AMOUNT = '250000048170000000000';

// Everything the server was sent, and every transaction the payer's wallet was asked for.
const requests = [];
const sent = [];

function answer(url, body) {
  if (url === '/api/me/credentials') return { credentials: [{ address: ADMIN }] };
  if (url === '/api/bounties') return { treasury: [] };
  if (url === '/api/tasks/t1/payments/intent') return { intent: { id: 'i1', taskId: 't1', to: body.stealth.address, token: 'NOX', amount: AMOUNT, stealth: true, ephemeralPublicKey: body.stealth.ephemeralPublicKey, viewTag: body.stealth.viewTag } };
  if (url === '/api/tasks/t1/payments' || url === '/api/payments/p1/announce') return { payment: { id: 'p1', state: 'confirming', status: 'pending' } };
  throw new Error(`unexpected request to ${url}`);
}

globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  requests.push({ url, body });
  return new Response(JSON.stringify(answer(url, body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
// the few browser globals the payment code and what it imports touch
globalThis.document = Object.assign(new EventTarget(), { querySelector: () => null, visibilityState: 'visible' });
globalThis.window = Object.assign(new EventTarget(), {
  ethereum: {
    async request({ method, params }) {
      if (method === 'eth_requestAccounts') return [ADMIN];
      if (method === 'eth_chainId') return '0x1';
      if (method === 'eth_sendTransaction') return `0x${String(sent.push(params[0])).padStart(64, '0')}`;
      throw Object.assign(new Error(`unsupported ${method}`), { code: 4200 });
    },
  },
});

const { default: store } = await import('../src/state/store.ts');
const { default: bounties } = await import('../src/actions/bounties.ts');

// Every 32-byte value anywhere in `text`, at every byte offset of every hex run in it.
function words(text) {
  const out = [];
  for (const [run] of text.matchAll(/[0-9a-f]{64,}/gi)) for (let i = 0; i + 64 <= run.length; i += 2) out.push(run.slice(i, i + 64));
  return out;
}

test('paying privately never sends the server, or the chain, the one-time key’s private half', async () => {
  store.set({
    nox: { token: NOX, chainId: 1, symbol: 'NOX', decimals: 18, explorer: 'https://etherscan.io', transferFeeBps: 0 },
    rewards: [{ symbol: 'NOX', address: NOX, decimals: 18 }],
    stealth: { announcer: ANNOUNCER, gasTopUpWei: '300000000000000' },
    users: { ana: { id: 'ana', name: 'Ana', address: ANA, stealthMeta: payee.meta } },
  });
  await bounties.pay({ id: 't1', bounty: '250000000000000000000', bountyToken: 'NOX', assigneeId: 'ana', bountyState: null });

  const intent = requests.find((r) => r.url.endsWith('/payments/intent')).body;
  assert.deepEqual(Object.keys(intent.stealth).sort(), ['address', 'ephemeralPublicKey', 'viewTag']);
  const { address, ephemeralPublicKey } = intent.stealth;
  assert.equal(sent[0].to, NOX);
  assert.ok(sent[0].data.endsWith(BigInt(AMOUNT).toString(16).padStart(64, '0')) && sent[0].data.includes(address.slice(2)), 'the tokens go to the one-time address');
  assert.equal(sent[1].to, ANNOUNCER);
  assert.ok(sent[1].data.includes(ephemeralPublicKey.slice(2)), 'the announcement carries the public half');

  // no 32-byte value the server or the wallet saw opens the ephemeral public key
  const seen = words(JSON.stringify({ requests, sent }));
  assert.ok(seen.length > 10);
  for (const word of seen) {
    let opens = false;
    try {
      opens = `0x${Buffer.from(secp256k1.getPublicKey(hexToBytes(word), true)).toString('hex')}` === ephemeralPublicKey;
    } catch {}
    assert.equal(opens, false, `${word} is the ephemeral private key`);
  }
});
