import './helpers/fakeTab.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import phoneClient, { phoneSession, ADDRESS } from './helpers/phoneClient.js';
import makePhoneWallet from '../src/lib/phone/makePhoneWallet.ts';
import createPhoneProvider from '../src/lib/phone/createPhoneProvider.ts';
import phoneStorage from '../src/lib/phone/phoneStorage.ts';
import phoneConfig from '../src/lib/phone/phoneConfig.ts';
import liveSession from '../src/lib/phone/liveSession.ts';
import peerName from '../src/lib/phone/peerName.ts';

const CONFIG = { projectId: '0'.repeat(32), relayUrl: 'wss://relay.example', chainId: 1 };
const DAY = 86400;

// A phone wallet wired to stand-ins: `clients` are what each load hands back, in turn, and the
// storage is the real one on this tab's local storage.
function world({ clients = [phoneClient()], config = CONFIG } = {}) {
  const loads = [];
  const published = [];
  const shut = [];
  let ids = 0;
  const wallet = makePhoneWallet({
    config: () => config,
    load: async (cfg, id) => {
      const client = clients[Math.min(loads.length, clients.length - 1)];
      loads.push({ cfg, id });
      return { client, shutdown: async () => void shut.push(id), createProvider: createPhoneProvider };
    },
    saved: phoneStorage,
    publish: (w) => published.push(w),
    newId: () => `conn${String(++ids).padStart(6, '0')}`,
    goodbyeMs: 50,
  });
  return { wallet, loads, published, shut };
}

test('connecting shows a code, then the wallet’s name and address, and nothing can sign until the person confirms', async () => {
  localStorage.clear();
  const { wallet, loads, published } = world();
  const started = wallet.start();
  await new Promise((r) => setImmediate(r));
  await started;
  assert.equal(wallet.get().status, 'connected');
  assert.deepEqual(wallet.get().wallet, { name: 'Test Wallet', address: ADDRESS, chainId: 1 });
  assert.equal(wallet.get().confirmed, false);
  assert.equal(wallet.provider(), null);
  // nothing joined the browser's wallets yet, and nothing is kept for a reload
  assert.deepEqual(published.filter(Boolean), []);
  assert.equal(phoneStorage.current(), null);
  assert.equal(loads[0].cfg, CONFIG);

  wallet.confirm();
  assert.equal(wallet.get().confirmed, true);
  assert.equal(published.at(-1).name, 'Test Wallet');
  assert.deepEqual(await published.at(-1).provider.request({ method: 'eth_accounts' }), [ADDRESS]);
  assert.equal(phoneStorage.current(), loads[0].id);
});

test('the phone is asked for the server’s network and Nil’s wallet methods only', async () => {
  localStorage.clear();
  const client = phoneClient({ sessions: [phoneSession({ accounts: [`eip155:11155111:${ADDRESS}`] })] });
  const { wallet } = world({ clients: [client], config: { ...CONFIG, chainId: 11155111 } });
  await wallet.start();
  assert.equal(wallet.get().wallet.chainId, 11155111);
  assert.deepEqual(client.proposed, { optionalNamespaces: { eip155: { chains: ['eip155:11155111'], methods: ['personal_sign', 'eth_sendTransaction', 'wallet_switchEthereumChain'], events: ['accountsChanged', 'chainChanged'] } } });
});

test('while waiting, the code holds the link to scan; a no on the phone and an expired code each say so', async () => {
  localStorage.clear();
  let reject;
  const waiting = phoneClient({ approval: () => new Promise((_, r) => (reject = r)) });
  const { wallet } = world({ clients: [waiting] });
  const started = wallet.start();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(wallet.get().status, 'waiting');
  assert.match(wallet.get().uri, /^wc:/);
  assert.ok(wallet.get().until > Date.now());
  reject({ code: 5000, message: 'User rejected.' });
  await started;
  assert.equal(wallet.get().status, 'failed');
  assert.equal(wallet.get().message, 'You declined the connection on your phone.');

  const late = phoneClient({ approval: async () => Promise.reject({ code: 0, message: 'Proposal expired' }) });
  const second = world({ clients: [late] });
  await second.wallet.start();
  assert.equal(second.wallet.get().status, 'expired');
});

test('closing the offer drops a connection nobody confirmed, and tells the phone', async () => {
  localStorage.clear();
  const client = phoneClient();
  const { wallet, shut } = world({ clients: [client] });
  const offered = wallet.offer();
  assert.equal(wallet.get().asking, true);
  await wallet.start();
  await wallet.dismiss();
  assert.equal(await offered, null);
  assert.deepEqual(client.disconnected.map((d) => d.topic), ['topic-1']);
  assert.equal(shut.length, 1);
  assert.equal(wallet.get().status, 'idle');
  assert.equal(wallet.get().asking, false);
});

test('an offer resolves with the phone wallet once the person confirms it', async () => {
  localStorage.clear();
  const { wallet } = world();
  const offered = wallet.offer();
  await wallet.start();
  wallet.confirm();
  const provider = await offered;
  assert.deepEqual(await provider.request({ method: 'eth_chainId' }), '0x1');
  assert.equal(await wallet.offer(), provider);
});

test('disconnecting tells the phone, stops the client and forgets every key WalletConnect kept', async () => {
  localStorage.clear();
  localStorage.setItem('nonos:wallet', '"io.rabby"');
  const client = phoneClient();
  const { wallet, published, shut, loads } = world({ clients: [client] });
  await wallet.start();
  wallet.confirm();
  // what WalletConnect's client writes while it runs
  const store = phoneStorage.open(loads[0].id);
  await store.setItem('wc@2:client:0.3//session', [{ topic: 'topic-1' }]);
  await store.setItem('wc@2:core:0.3//keychain', { 'topic-1': 'secret' });
  await wallet.disconnect();
  assert.deepEqual(client.disconnected, [{ topic: 'topic-1', reason: { code: 6000, message: 'User disconnected.' } }]);
  assert.deepEqual(shut, [loads[0].id]);
  assert.equal(published.at(-1), null);
  assert.equal(wallet.get().status, 'idle');
  const left = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
  assert.deepEqual(left, ['nonos:wallet']);
});

test('a phone that never answers the goodbye doesn’t hold disconnecting up', async () => {
  localStorage.clear();
  const client = phoneClient();
  client.disconnect = () => new Promise(() => {});
  const { wallet, shut } = world({ clients: [client] });
  await wallet.start();
  wallet.confirm();
  const began = Date.now();
  await wallet.disconnect();
  assert.ok(Date.now() - began < 1000);
  assert.equal(shut.length, 1);
});

test('after a reload the confirmed phone wallet comes back, with the same session, without a new code', async () => {
  localStorage.clear();
  const client = phoneClient();
  const first = world({ clients: [client] });
  await first.wallet.start();
  first.wallet.confirm();
  const id = phoneStorage.current();

  // a new page: a new wallet module and a new client built from the same storage
  const reloaded = phoneClient({ sessions: client.session.getAll() });
  const second = world({ clients: [reloaded] });
  await second.wallet.restore();
  assert.equal(second.loads[0].id, id);
  assert.equal(second.wallet.get().status, 'connected');
  assert.equal(second.wallet.get().confirmed, true);
  assert.equal(second.published.at(-1).name, 'Test Wallet');
  assert.deepEqual(await second.published.at(-1).provider.request({ method: 'eth_requestAccounts' }), [ADDRESS]);
  await second.published.at(-1).provider.request({ method: 'personal_sign', params: ['0x00', ADDRESS] });
  assert.equal(reloaded.sent.length, 1);
  assert.equal(reloaded.proposed, undefined);
});

test('a reload finds nothing to restore when the session ran out, or nobody confirmed one', async () => {
  localStorage.clear();
  phoneStorage.remember('conn999999');
  const expired = phoneClient({ sessions: [phoneSession({ expiry: Math.floor(Date.now() / 1000) - 10 })] });
  const a = world({ clients: [expired] });
  await a.wallet.restore();
  assert.equal(a.wallet.get().status, 'idle');
  assert.equal(phoneStorage.current(), null);
  assert.deepEqual(a.shut, ['conn999999']);

  // records left by a code nobody confirmed are wiped without loading anything
  localStorage.setItem('nonos:wc:conn000042:wc@2:core:0.3//keychain', '{}');
  const b = world();
  await b.wallet.restore();
  assert.deepEqual(b.loads, []);
  assert.equal(localStorage.getItem('nonos:wc:conn000042:wc@2:core:0.3//keychain'), null);
});

test('signing out reaches a phone wallet connected in an earlier page load', async () => {
  localStorage.clear();
  const client = phoneClient();
  const first = world({ clients: [client] });
  await first.wallet.start();
  first.wallet.confirm();
  const reloaded = phoneClient({ sessions: client.session.getAll() });
  const second = world({ clients: [reloaded] });
  await second.wallet.end();
  assert.deepEqual(reloaded.disconnected.map((d) => d.topic), ['topic-1']);
  assert.equal(phoneStorage.current(), null);
});

test('when the phone ends the session, the wallet leaves the list and the person is told', async () => {
  localStorage.clear();
  const client = phoneClient();
  const { wallet, published } = world({ clients: [client] });
  await wallet.start();
  wallet.confirm();
  client.emit('session_delete', { id: 1, topic: 'topic-1' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(published.at(-1), null);
  assert.equal(wallet.get().status, 'idle');
  assert.equal(wallet.get().message, 'Your phone wallet disconnected from Nil.');
  assert.equal(phoneStorage.current(), null);
});

test('a server with phone wallets off offers nothing and loads nothing', async () => {
  const { wallet, loads } = world({ config: null });
  assert.equal(wallet.enabled(), false);
  assert.equal(await wallet.offer(), null);
  await wallet.start();
  assert.deepEqual(loads, []);
});

test('the storage keeps each connection apart, and a closed one writes nothing more', async () => {
  localStorage.clear();
  const a = phoneStorage.open('conna0000001');
  const b = phoneStorage.open('connb0000001');
  await a.setItem('k', { v: 1 });
  await b.setItem('k', { v: 2 });
  assert.deepEqual(await a.getItem('k'), { v: 1 });
  assert.deepEqual(await a.getKeys(), ['k']);
  assert.deepEqual(await b.getEntries(), [['k', { v: 2 }]]);
  a.close();
  await a.setItem('k2', 'late');
  assert.equal(await a.getItem('k2'), undefined);
  await a.setItem('k', undefined);
  phoneStorage.remember('conna0000001');
  phoneStorage.forgetAll();
  assert.equal(localStorage.length, 0);
  // a stored id that isn't one Nil makes is ignored
  localStorage.setItem('nonos:wc:current', '../../etc');
  assert.equal(phoneStorage.current(), null);
});

test('the server’s settings are taken only when they make sense', () => {
  phoneConfig.set({ projectId: 'f'.repeat(32), relayUrl: 'wss://relay.walletconnect.org', chainId: 1 });
  assert.deepEqual(phoneConfig.get(), { projectId: 'f'.repeat(32), relayUrl: 'wss://relay.walletconnect.org', chainId: 1 });
  for (const bad of [null, {}, { projectId: 'nope', relayUrl: 'wss://r', chainId: 1 }, { projectId: 'f'.repeat(32), relayUrl: 'https://r', chainId: 1 }, { projectId: 'f'.repeat(32), relayUrl: 'wss://r/path', chainId: 1 }, { projectId: 'f'.repeat(32), relayUrl: 'wss://r', chainId: 0 }]) {
    phoneConfig.set(bad);
    assert.equal(phoneConfig.get(), null, JSON.stringify(bad));
  }
});

test('the session carried on with is the newest one still running with an account in it', () => {
  const now = Date.now();
  const older = phoneSession({ topic: 'a', expiry: now / 1000 + DAY });
  const newer = phoneSession({ topic: 'b', expiry: now / 1000 + 2 * DAY });
  const gone = phoneSession({ topic: 'c', expiry: now / 1000 - 1 });
  const empty = phoneSession({ topic: 'd', expiry: now / 1000 + 3 * DAY, accounts: ['solana:5eyk:abc'] });
  assert.equal(liveSession([older, newer, gone, empty], now).topic, 'b');
  assert.equal(liveSession([gone, empty], now), null);
});

test('a wallet’s name is shown as plain text of a sensible length', () => {
  assert.equal(peerName({ name: '  MetaMask Wallet ' }), 'MetaMask Wallet');
  assert.equal(peerName({ name: 'Evil‮laW' }), 'EvillaW');
  assert.equal(peerName({ name: 'x'.repeat(80) }).length, 40);
  assert.equal(peerName({}), 'Phone wallet');
  assert.equal(peerName(null), 'Phone wallet');
});
