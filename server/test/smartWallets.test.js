import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import smartWallet from './helpers/smartWallet.js';
import sigValidatorCode from '../chain/sigValidatorCode.js';

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();

before(async () => {
  srv = await startServer({ chain, env: { SIGNIN_CHAIN_TIMEOUT_SECONDS: '1' } });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

const inviteToken = async () => (await owner('POST', '/api/invites', { role: 'member' })).data.token;

// Signs a challenge with any signature the test picks, instead of the wallet's own.
async function verifyWith(who, w, mode, sign, extra = {}) {
  const challenge = await who('POST', '/api/auth/wallet/challenge', { address: w.address, mode, ...extra });
  assert.equal(challenge.status, 200);
  return who('POST', '/api/auth/wallet/verify', { challengeId: challenge.data.challengeId, signature: sign(challenge.data.message) });
}

async function join(w, name) {
  const res = await client(base).wallet(w, 'invite', { name, inviteToken: await inviteToken() });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res;
}

test('the EIP-6492 validator is the pinned reference build', () => {
  assert.equal(crypto.createHash('sha256').update(sigValidatorCode).digest('hex'), 'ec4a19633d426bab3cc0ffcd59029f51e72b5d609f49c67f8a8641cc5a7eb78e');
});

test('plain wallets are still checked first, without asking the chain', async () => {
  chain.calls.length = 0;
  assert.equal((await client(base).wallet(ownerWallet, 'login')).status, 200);
  assert.deepEqual(chain.calls, []);
});

test('a deployed smart wallet joins and signs in through EIP-1271', async () => {
  const w = smartWallet();
  chain.addSmartWallet(w);
  const joined = await join(w, 'Ana');
  assert.equal(joined.data.user.address, w.address);
  chain.calls.length = 0;
  assert.equal((await client(base).wallet(w, 'login')).status, 200);
  assert.ok(chain.calls.some((c) => c.method === 'eth_call'));
});

test('a smart wallet signature from a key that doesn’t own the wallet is refused', async () => {
  const w = smartWallet();
  chain.addSmartWallet(w);
  await join(w, 'Bo');
  const forged = await verifyWith(client(base), w, 'login', w.forge);
  assert.equal(forged.status, 401);
  assert.match(forged.data.error, /doesn’t match the wallet/);
  // a plain signature from some other key fails the same way, after the chain says no
  const plain = await verifyWith(client(base), w, 'login', (m) => wallet().sign(m));
  assert.equal(plain.status, 401);
});

test('a passkey wallet that isn’t deployed yet signs in with EIP-6492, and still can once deployed', async () => {
  const w = smartWallet({ deployed: false });
  chain.addSmartWallet(w);
  assert.ok(w.sign('x').endsWith('6492'.repeat(16)));
  await join(w, 'Cy');
  assert.equal((await client(base).wallet(w, 'login')).status, 200);
  chain.deploy(w.address);
  assert.equal((await client(base).wallet(w, 'login')).status, 200);
  assert.equal((await verifyWith(client(base), w, 'login', w.sign6492)).status, 200);
});

test('an EIP-6492 signature whose factory call doesn’t create the wallet is refused', async () => {
  const w = smartWallet({ deployed: false });
  chain.addSmartWallet(w);
  const token = await inviteToken();
  const res = await verifyWith(client(base), w, 'invite', (m) => w.sign6492(m, { factoryData: '0xdeadbeef' }), { name: 'Dee', inviteToken: token });
  assert.equal(res.status, 401);
  // nothing was created, so the invite still works for the real signature
  assert.equal((await client(base).wallet(w, 'invite', { name: 'Dee', inviteToken: token })).status, 200);
});

test('a node that is too slow gets a clear error instead of a hanging sign-in', async () => {
  const w = smartWallet();
  chain.addSmartWallet(w);
  await join(w, 'Eve');
  chain.setCallDelay(2500);
  try {
    const started = Date.now();
    const res = await client(base).wallet(w, 'login');
    assert.equal(res.status, 503);
    assert.match(res.data.error, /smart wallet.*didn’t finish in time/);
    assert.ok(Date.now() - started < 2300, 'the configured timeout applies');
  } finally {
    chain.setCallDelay(0);
  }
});

test('a smart wallet signing for another network is told which one to use', async () => {
  const w = smartWallet();
  chain.addSmartWallet(w);
  await join(w, 'Fay');
  const res = await verifyWith(client(base), w, 'login', w.forge, { chainId: 8453 });
  assert.equal(res.status, 401);
  assert.match(res.data.error, /switch it to Ethereum mainnet/);
});

test('people can link a smart wallet as their backup and sign in with it', async () => {
  const member = client(base);
  await member.wallet(wallet(), 'invite', { name: 'Gus', inviteToken: await inviteToken() });
  const w = smartWallet({ deployed: false });
  chain.addSmartWallet(w);
  assert.equal((await member.wallet(w, 'add')).status, 200);
  assert.equal((await member('GET', '/api/me/credentials')).data.credentials.length, 2);
  assert.equal((await client(base).wallet(w, 'login')).data.user.name, 'Gus');
});

test('signatures that aren’t hex, or far too long, are refused before any chain call', async () => {
  chain.calls.length = 0;
  for (const signature of ['nope', '0x123', `0x${'ab'.repeat(20_000)}`]) {
    const res = await verifyWith(client(base), ownerWallet, 'login', () => signature);
    assert.equal(res.status, 401);
  }
  assert.deepEqual(chain.calls, []);
});
