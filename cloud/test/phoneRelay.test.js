import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SignClient } from '@walletconnect/sign-client';
import connectPhone from '../phone/connectPhone.js';
import createSignupFlow from '../signup/createSignupFlow.js';
import proofOfWork from '../signup/proofOfWork.js';
import siwe from '../signup/siwe.js';
import memoryStorage from '../phone/memoryStorage.js';
import fakeRelay from './helpers/fakeRelay.js';
import testContext from './helpers/testContext.js';
import wallet from './helpers/wallet.js';

// The sign-up page's phone connection with the pinned WalletConnect client, against a stand-in
// relay on this machine, with a second client in Node playing the phone. Nothing leaves the
// machine, and anything that reaches for browser storage or the network is recorded. The other
// test files share this process, so the stand-ins for the browser's globals last only as long
// as this suite.
const touched = [];
const trap = (name) => new Proxy({}, { get: (_, prop) => (touched.push(`${name}.${String(prop)}`), () => null) });
const browser = {
  localStorage: trap('localStorage'),
  indexedDB: trap('indexedDB'),
  location: { origin: 'https://nil.test' },
  fetch: async (url) => {
    touched.push(`fetch ${url}`);
    throw new Error('no network in this test');
  },
};
const saved = Object.fromEntries(Object.keys(browser).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

const PROJECT = '0'.repeat(32);
const key = wallet();
let relay;
let phone;
let decline = false;

describe('a phone wallet on the sign-up page', () => {
  before(async () => {
    for (const [name, value] of Object.entries(browser)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    relay = await fakeRelay();
    phone = await SignClient.init({ projectId: PROJECT, relayUrl: relay.url, customStoragePrefix: 'phone', storage: memoryStorage(), logger: 'silent', telemetryEnabled: false, metadata: { name: 'Test\u202e Wallet', description: 'A wallet in a test', url: 'https://wallet.example', icons: [] } });
    phone.on('session_proposal', ({ id, params }) => {
      const asked = params.optionalNamespaces.eip155;
      void phone.approve({ id, namespaces: { eip155: { chains: asked.chains, methods: asked.methods, events: asked.events, accounts: asked.chains.map((c) => `${c}:${key.address}`) } } });
    });
    phone.on('session_request', ({ topic, id, params }) => {
      const text = Buffer.from(params.request.params[0].slice(2), 'hex').toString('utf8');
      const response = decline ? { id, jsonrpc: '2.0', error: { code: 5000, message: 'User rejected.' } } : { id, jsonrpc: '2.0', result: key.sign(text) };
      void phone.respond({ topic, response });
    });
  });

  after(async () => {
    phone?.core.heartbeat.stop();
    await phone?.core.relayer.transportClose().catch(() => {});
    await relay?.close();
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  async function pair() {
    const link = await connectPhone({ projectId: PROJECT, relayUrl: relay.url });
    assert.match(link.uri, /^wc:[0-9a-f]{64}@2\?/);
    await phone.pair({ uri: link.uri });
    return { link, ...(await link.approved()) };
  }

  test('a phone signs a sign-up: one personal_sign, and the server takes the signature', async () => {
    const ctx = testContext();
    const flow = createSignupFlow(ctx, { provision: async () => {} });
    const { link, name, address, wallet: w } = await pair();
    assert.equal(name, 'Test Wallet', 'the wallet’s name is shown as plain text');
    assert.equal(address.toLowerCase(), key.address.toLowerCase());
    assert.deepEqual(await w.request({ method: 'eth_requestAccounts' }), [address]);
    assert.equal(await w.request({ method: 'eth_chainId' }), '0x1');
    await assert.rejects(w.request({ method: 'eth_sendTransaction', params: [{}] }), (err) => err.code === 4200);
    await assert.rejects(w.request({ method: 'personal_sign', params: ['0x00', wallet().address] }), (err) => err.code === 4100);

    const challenge = flow.challenge({ name: 'phoneteam', address, chainId: 1 }, '203.0.113.9');
    const signature = await w.request({ method: 'personal_sign', params: [`0x${Buffer.from(challenge.message).toString('hex')}`, address] });
    assert.equal(siwe.recover(challenge.message, signature).toLowerCase(), key.address.toLowerCase());
    const created = flow.verify({ challengeId: challenge.challengeId, signature, nonce: proofOfWork.solve(challenge.pow.salt, challenge.pow.bits) }, '203.0.113.9');
    assert.equal(created.url, 'https://phoneteam.nil.test');

    const gone = new Promise((resolve) => phone.once('session_delete', resolve));
    await link.close();
    await gone;
    assert.equal(phone.session.getAll().length, 0, 'closing tells the phone');
  });

  test('saying no on the phone reads as saying no in a wallet', async () => {
    decline = true;
    const { link, address, wallet: w } = await pair();
    await assert.rejects(w.request({ method: 'personal_sign', params: ['0x6869', address] }), (err) => err.code === 4001 && /declined/.test(err.message));
    await link.close();
    decline = false;
  });

  test('nothing touched browser storage or the network, and the relay heard only encrypted requests', () => {
    assert.deepEqual(touched, []);
    for (const c of relay.connections) assert.match(c.url, new RegExp(`projectId=${PROJECT}`));
    const proposal = relay.requests.find((r) => r.method === 'wc_proposeSession');
    assert.equal(proposal.params.attestation, '');
    const asked = relay.requests.filter((r) => r.method === 'irn_publish' && r.params.tag === 1108);
    assert.equal(asked.length, 2, 'the signature and the declined one');
    for (const r of asked) {
      assert.deepEqual(Object.keys(r.params).filter((k) => !['topic', 'message', 'ttl', 'prompt', 'tag', 'attestation', 'correlationId'].includes(k)), []);
      assert.equal(r.params.attestation, '');
    }
    // the phone's own client is the one left
    assert.deepEqual(Object.keys(globalThis).filter((k) => k.startsWith('_walletConnectCore_')).sort(), ['_walletConnectCore_phone', '_walletConnectCore_phone_count'], 'every closed client is gone');
  });
});
