import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SignClient } from '@walletconnect/sign-client';
import fakeRelay from '../../server/test/helpers/fakeRelay.js';
import wallet from '../../server/test/helpers/wallet.js';

// The pinned WalletConnect client, as Nil sets it up, against a stand-in relay on this machine,
// with a second client in Node playing the phone. Nothing here leaves the machine.
const saved = new Map();
globalThis.localStorage = {
  get length() {
    return saved.size;
  },
  key: (i) => [...saved.keys()][i] ?? null,
  getItem: (k) => (saved.has(k) ? saved.get(k) : null),
  setItem: (k, v) => void saved.set(k, String(v)),
  removeItem: (k) => void saved.delete(k),
};
globalThis.location = { origin: 'https://nil.example' };
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  throw new Error('no network in this test');
};

const { default: createSignClient } = await import('../src/lib/phone/createSignClient.ts');
const { default: createPhoneProvider } = await import('../src/lib/phone/createPhoneProvider.ts');
const { default: recoverAddress } = await import('../src/lib/crypto/recoverAddress.ts');
const { default: phoneProtocol } = await import('../src/lib/phone/phoneProtocol.ts');

const PROJECT = '0'.repeat(32);
const key = wallet();
let relay;
let dapp;
let phone;
let session;

before(async () => {
  relay = await fakeRelay();
  dapp = await createSignClient({ projectId: PROJECT, relayUrl: relay.url, chainId: 1 }, 'conntest00001');
  phone = await SignClient.init({ projectId: PROJECT, relayUrl: relay.url, customStoragePrefix: 'phone', logger: 'silent', telemetryEnabled: false, metadata: { name: 'Test Wallet', description: 'A wallet in a test', url: 'https://wallet.example', icons: [] } });
  phone.on('session_proposal', ({ id, params }) => {
    const asked = params.optionalNamespaces.eip155;
    void phone.approve({ id, namespaces: { eip155: { chains: asked.chains, methods: asked.methods, events: asked.events, accounts: asked.chains.map((c) => `${c}:${key.address}`) } } });
  });
  phone.on('session_request', ({ topic, id, params }) => {
    const { method, params: args } = params.request;
    const result = method === 'personal_sign' ? key.sign(Buffer.from(args[0].slice(2), 'hex').toString('utf8')) : `0x${'cd'.repeat(32)}`;
    void phone.respond({ topic, response: { id, jsonrpc: '2.0', result } });
  });
});

after(async () => {
  await dapp?.shutdown();
  phone?.core.heartbeat.stop();
  await phone?.core.relayer.transportClose().catch(() => {});
  await relay?.close();
});

test('a phone pairs from the code and approves only what Nil asked for', async () => {
  const { uri, approval } = await dapp.client.connect({ optionalNamespaces: { eip155: { chains: ['eip155:1'], methods: phoneProtocol.remote, events: phoneProtocol.events } } });
  assert.match(uri, /^wc:[0-9a-f]{64}@2\?/);
  await phone.pair({ uri });
  session = await approval();
  assert.deepEqual(session.namespaces.eip155.accounts, [`eip155:1:${key.address}`]);
  assert.deepEqual(session.namespaces.eip155.methods, ['personal_sign', 'eth_sendTransaction', 'wallet_switchEthereumChain']);
  assert.equal(session.peer.metadata.name, 'Test Wallet');
});

test('signing and sending through the wrapper reach the phone and come back', async () => {
  const provider = createPhoneProvider({ client: dapp.client, topic: session.topic, chainId: 1 });
  const message = 'nil.example wants you to sign in with your Ethereum account';
  const hex = `0x${Buffer.from(message).toString('hex')}`;
  const [address] = await provider.request({ method: 'eth_requestAccounts' });
  const signature = await provider.request({ method: 'personal_sign', params: [hex, address] });
  assert.equal(recoverAddress(message, signature), key.address.toLowerCase());
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: address, to: '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca', data: '0xa9059cbb', value: '0x0' }] });
  assert.equal(hash, `0x${'cd'.repeat(32)}`);
  provider.close();
});

test('the relay is the only host contacted, and Nil’s client tells it nothing beside the encrypted messages', () => {
  assert.deepEqual(fetched, []);
  assert.ok(relay.connections.length >= 2);
  for (const c of relay.connections) assert.match(c.url, new RegExp(`projectId=${PROJECT}`));
  const proposal = relay.requests.find((r) => r.method === 'wc_proposeSession');
  assert.equal(proposal.params.attestation, '');
  // Nil's request (tag 1108) carries its id and nothing about what it asks or where
  const asked = relay.requests.filter((r) => r.method === 'irn_publish' && r.params.tag === 1108);
  assert.equal(asked.length, 2);
  for (const r of asked) {
    assert.deepEqual(Object.keys(r.params).filter((k) => !['topic', 'message', 'ttl', 'prompt', 'tag', 'attestation', 'correlationId'].includes(k)), []);
    assert.equal(r.params.attestation, '');
  }
  // The phone's own client, which Nil doesn't control, names the method and the transaction
  // beside its answers. That's why the docs say the relay can learn a payment's hash.
  const answered = relay.requests.filter((r) => r.method === 'irn_publish' && r.params.tag === 1109);
  assert.ok(answered.some((r) => r.params.txHashes?.includes(`0x${'cd'.repeat(32)}`)));
});

test('nothing WalletConnect keeps is written outside Nil’s own storage prefix', () => {
  const keys = [...saved.keys()];
  assert.ok(keys.length > 0);
  for (const k of keys) assert.match(k, /^nonos:wc:conntest00001:/);
});

test('disconnecting reaches the phone', async () => {
  const gone = new Promise((resolve) => phone.once('session_delete', resolve));
  await dapp.client.disconnect({ topic: session.topic, reason: { code: 6000, message: 'User disconnected.' } });
  assert.equal((await gone).topic, session.topic);
  assert.equal(phone.session.getAll().length, 0);
});
