import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import wallet from '../../server/test/helpers/wallet.js';
import { keyring, keyDirectory, entry, person, signIn, route, reset, sent } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const vault = await load('actions/vault');
const ethereum = await load('lib/ethereum');

const users = [{ id: 'v', name: 'Vic' }, { id: 'b', name: 'Bob' }];
const published = () => sent.filter((r) => r.method === 'PUT' && r.url === '/api/me/encryption-key');

beforeEach(() => {
  reset();
  const w = wallet();
  ethereum.account = async () => ({ address: w.address, chainId: 1 });
  ethereum.sign = async (message) => w.sign(message);
  // a server with no keys and no wallet copies on record for Vic
  route('GET', '/api/encryption-keys', () => [entry('b', person())]);
  route('GET', '/api/me/identity-wraps', () => ({ wraps: [] }));
  route('PUT', '/api/me/encryption-key', () => ({}));
  signIn('v', null, users);
});

test('someone new gets their keys made on the first unlock', async () => {
  await vault.unlock();
  assert.equal(published().length, 1);
  assert.ok(keyring.identity());
});

test('a server that drops someone’s keys can’t quietly move them to new ones', async () => {
  // this browser saw Vic's key listed before
  const V = person();
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('b', person())]);
  await keyDirectory.load({ fresh: true });
  route('GET', '/api/encryption-keys', () => [entry('b', person())]);
  await assert.rejects(vault.unlock(), (err) => err.kind === 'missing' && /missing from the server/.test(err.message));
  assert.equal(published().length, 0);
  assert.equal(keyring.identity(), null);
  // starting over is a choice made on the screen that says so
  await vault.unlock({ reset: true });
  assert.deepEqual(published().map((r) => r.body.reset), [true]);
});

test('unlocking with a passkey stops the same way when the server drops everything', async () => {
  const V = person();
  route('GET', '/api/encryption-keys', () => [entry('v', V)]);
  await keyDirectory.load({ fresh: true });
  // the server now lists no keys, no wallet copies and no passkeys for Vic
  route('GET', '/api/encryption-keys', () => []);
  await assert.rejects(vault.unlock({ passkey: true }), (err) => err.kind === 'missing');
  assert.equal(published().length, 0);
  assert.equal(keyring.identity(), null);
});

test('someone who never had keys here is told to add a passkey, not that keys are missing', async () => {
  await assert.rejects(vault.unlock({ passkey: true }), (err) => err.kind !== 'missing' && /No passkey unlocks your keys yet/.test(err.message));
});
