import './helpers/fakeTab.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import phoneClient, { phoneSession, ADDRESS, OTHER } from './helpers/phoneClient.js';
import createPhoneProvider from '../src/lib/phone/createPhoneProvider.ts';
import wallets from '../src/lib/wallets.ts';
import ethereum from '../src/lib/ethereum.ts';

const SEPOLIA = 11155111;
const open = (client, extra = {}) => createPhoneProvider({ client, topic: 'topic-1', chainId: 1, ...extra });
const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

test('accounts and the network are answered from the session, without asking the phone', async () => {
  const client = phoneClient();
  const p = open(client);
  assert.deepEqual(await p.request({ method: 'eth_requestAccounts' }), [ADDRESS]);
  assert.deepEqual(await p.request({ method: 'eth_accounts' }), [ADDRESS]);
  assert.equal(await p.request({ method: 'eth_chainId' }), '0x1');
  assert.deepEqual(client.sent, []);
});

test('signing and sending go to the phone, on the session’s network, with WalletConnect’s shortest expiry', async () => {
  const client = phoneClient();
  const p = open(client);
  const signature = await p.request({ method: 'personal_sign', params: ['0x68656c6c6f', ADDRESS] });
  assert.equal(signature, `0x${'ab'.repeat(65)}`);
  const tx = { from: ADDRESS, to: OTHER, data: '0xa9059cbb', value: '0x0' };
  assert.equal(await p.request({ method: 'eth_sendTransaction', params: [tx] }), `0x${'cd'.repeat(32)}`);
  assert.deepEqual(
    client.sent.map((s) => [s.topic, s.chainId, s.request.method, s.expiry]),
    [
      ['topic-1', 'eip155:1', 'personal_sign', 300],
      ['topic-1', 'eip155:1', 'eth_sendTransaction', 300],
    ],
  );
  assert.deepEqual(client.sent[1].request.params, [tx]);
});

test('nothing else goes to the phone: reads, typed data and batches are turned down with 4200', async () => {
  const client = phoneClient();
  const p = open(client);
  for (const method of ['eth_call', 'eth_getBalance', 'eth_signTypedData_v4', 'wallet_getCapabilities', 'wallet_sendCalls', 'eth_sign']) {
    await assert.rejects(p.request({ method, params: [] }), (err) => err.code === 4200, method);
  }
  assert.deepEqual(client.sent, []);
});

test('with a phone wallet, a payout batch falls back to one transaction at a time, as for any wallet that can’t batch', async () => {
  const client = phoneClient();
  wallets.setPhone({ id: 'walletconnect', name: 'Test Wallet (phone)', icon: null, provider: open(client) });
  wallets.choose('walletconnect');
  try {
    assert.equal(wallets.active()?.id, 'walletconnect');
    assert.deepEqual(await ethereum.account(), { address: ADDRESS, chainId: 1 });
    assert.equal(await ethereum.batch(ADDRESS, 1, [{ to: OTHER, data: '0x' }]), null);
    assert.equal(await ethereum.send({ from: ADDRESS, to: OTHER, data: '0x01' }), `0x${'cd'.repeat(32)}`);
    assert.deepEqual(client.sent.map((s) => s.request.method), ['eth_sendTransaction']);
  } finally {
    wallets.setPhone(null);
  }
  assert.equal(wallets.chosenId(), null);
  assert.ok(!wallets.list().some((w) => w.id === 'walletconnect'));
});

test('Nil asks the phone to sign only for the address it connected', async () => {
  const client = phoneClient();
  const p = open(client);
  await assert.rejects(p.request({ method: 'personal_sign', params: ['0x00', OTHER] }), (err) => err.code === 4100);
  await assert.rejects(p.request({ method: 'eth_sendTransaction', params: [{ from: OTHER, to: ADDRESS, data: '0x' }] }), (err) => err.code === 4100);
  // the same address in another case is the same address
  await p.request({ method: 'personal_sign', params: ['0x00', ADDRESS.toUpperCase().replace('0X', '0x')] });
  assert.equal(client.sent.length, 1);
});

test('a method the phone didn’t approve when it connected is refused here', async () => {
  const client = phoneClient({ sessions: [phoneSession({ methods: ['personal_sign'] })] });
  const p = open(client);
  await assert.rejects(p.request({ method: 'eth_sendTransaction', params: [{ from: ADDRESS, to: OTHER, data: '0x' }] }), (err) => err.code === 4200);
  assert.deepEqual(client.sent, []);
});

test('a no on the phone reads like a no in a browser wallet', async () => {
  const client = phoneClient();
  client.answer = async () => Promise.reject({ code: 5000, message: 'User rejected.' });
  const p = open(client);
  await assert.rejects(p.request({ method: 'personal_sign', params: ['0x00', ADDRESS] }), (err) => err.code === 4001);
  wallets.setPhone({ id: 'walletconnect', name: 'Test Wallet (phone)', icon: null, provider: p });
  wallets.choose('walletconnect');
  try {
    await assert.rejects(ethereum.sign('hello', ADDRESS), /You declined the request in your wallet/);
  } finally {
    wallets.setPhone(null);
  }
});

test('a request the phone never answers times out cleanly, and the notice goes away', async () => {
  const client = phoneClient();
  client.answer = () => later(120, '0xlate');
  const shown = [];
  const watch = (request) => {
    shown.push(request);
    return () => shown.splice(shown.indexOf(request), 1);
  };
  const p = open(client, { timeoutMs: 40, watch });
  const asked = p.request({ method: 'personal_sign', params: ['0x00', ADDRESS] });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].kind, 'sign');
  assert.ok(shown[0].until > Date.now());
  await assert.rejects(asked, /didn’t answer within the time allowed/);
  assert.deepEqual(shown, []);
  // the phone's late answer goes nowhere, and WalletConnect was still given its minimum expiry
  await later(150);
  assert.equal(client.sent[0].expiry, 300);
});

test('stopping a request here turns it down at once', async () => {
  const client = phoneClient();
  client.answer = () => new Promise(() => {});
  let request;
  const p = open(client, { watch: (r) => ((request = r), () => {}) });
  const asked = p.request({ method: 'eth_sendTransaction', params: [{ from: ADDRESS, to: OTHER, data: '0x' }] });
  assert.equal(request.kind, 'pay');
  request.cancel();
  await assert.rejects(asked, /Cancelled here/);
});

test('moving between networks the phone approved needs nothing from the phone', async () => {
  const client = phoneClient({ sessions: [phoneSession({ accounts: [`eip155:1:${ADDRESS}`, `eip155:${SEPOLIA}:${ADDRESS}`] })] });
  const p = open(client);
  assert.equal(await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }), null);
  assert.equal(await p.request({ method: 'eth_chainId' }), '0xaa36a7');
  await p.request({ method: 'personal_sign', params: ['0x00', ADDRESS] });
  assert.deepEqual(client.sent.map((s) => [s.chainId, s.request.method]), [[`eip155:${SEPOLIA}`, 'personal_sign']]);
  // and ethereum.useChain, which every payment calls first, does the same
  wallets.setPhone({ id: 'walletconnect', name: 'Test Wallet (phone)', icon: null, provider: p });
  wallets.choose('walletconnect');
  try {
    await ethereum.useChain(1);
    assert.equal(p.chainId(), 1);
  } finally {
    wallets.setPhone(null);
  }
  assert.equal(client.sent.length, 1);
});

test('a network the phone hasn’t approved is asked for, and used only once the phone adds it', async () => {
  const client = phoneClient();
  const p = open(client);
  client.answer = async ({ request }) => {
    // the phone approves by adding the network to the session, as wallets do with a session update
    client.session.set(phoneSession({ accounts: [`eip155:1:${ADDRESS}`, `eip155:137:${ADDRESS}`] }));
    return request.method === 'wallet_switchEthereumChain' ? null : '0x';
  };
  await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] });
  assert.deepEqual(client.sent.map((s) => [s.chainId, s.request.method, s.request.params]), [['eip155:1', 'wallet_switchEthereumChain', [{ chainId: '0x89' }]]]);
  assert.equal(await p.request({ method: 'eth_chainId' }), '0x89');

  const stubborn = phoneClient();
  const q = open(stubborn);
  await assert.rejects(q.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] }), (err) => err.code === 4902);
  assert.equal(await q.request({ method: 'eth_chainId' }), '0x1');
  await assert.rejects(q.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: 'polygon' }] }), (err) => err.code === -32602);
});

test('without leave to switch, a network the phone hasn’t approved is refused with 4902', async () => {
  const client = phoneClient({ sessions: [phoneSession({ methods: ['personal_sign', 'eth_sendTransaction'] })] });
  const p = open(client);
  await assert.rejects(p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] }), (err) => err.code === 4902);
  assert.deepEqual(client.sent, []);
});

test('the phone switching network or account is followed, within what it approved', async () => {
  const client = phoneClient({ sessions: [phoneSession({ accounts: [`eip155:1:${ADDRESS}`, `eip155:1:${OTHER}`, `eip155:${SEPOLIA}:${ADDRESS}`] })] });
  const p = open(client);
  client.emit('session_event', { topic: 'topic-1', params: { event: { name: 'chainChanged', data: SEPOLIA }, chainId: `eip155:${SEPOLIA}` } });
  assert.equal(p.chainId(), SEPOLIA);
  client.emit('session_event', { topic: 'topic-1', params: { event: { name: 'chainChanged', data: '0x89' } } });
  assert.equal(p.chainId(), SEPOLIA);
  client.emit('session_event', { topic: 'topic-1', params: { event: { name: 'chainChanged', data: 'eip155:1' } } });
  client.emit('session_event', { topic: 'topic-1', params: { event: { name: 'accountsChanged', data: [`eip155:1:${OTHER}`] } } });
  assert.deepEqual(await p.request({ method: 'eth_accounts' }), [OTHER]);
  // another session's events are none of this one's business
  client.emit('session_event', { topic: 'topic-2', params: { event: { name: 'chainChanged', data: SEPOLIA } } });
  assert.equal(p.chainId(), 1);
});

test('when the phone disconnects, waiting and later requests are turned down, and Nil is told once', async () => {
  const client = phoneClient();
  client.answer = () => new Promise(() => {});
  let ended = 0;
  const p = open(client, { onEnd: () => ended++ });
  const asked = p.request({ method: 'personal_sign', params: ['0x00', ADDRESS] });
  client.emit('session_delete', { id: 1, topic: 'topic-2' });
  assert.equal(ended, 0);
  client.emit('session_delete', { id: 1, topic: 'topic-1' });
  client.emit('session_expire', { topic: 'topic-1' });
  await assert.rejects(asked, (err) => err.code === 4900 && /disconnected/.test(err.message));
  await assert.rejects(p.request({ method: 'eth_accounts' }), (err) => err.code === 4900);
  assert.equal(ended, 1);
  assert.equal(client.listening('session_event') + client.listening('session_delete') + client.listening('session_expire'), 0);
});
