import { test } from 'node:test';
import assert from 'node:assert/strict';
import phoneProvider from '../phone/phoneProvider.js';

const ADDRESS = `0x${'ab'.repeat(20)}`;

// A WalletConnect client whose phone never answers, which records what it was asked.
function silentClient() {
  const asked = [];
  return { asked, request: (args) => (asked.push(args), new Promise(() => {})) };
}

test('the phone wallet answers accounts and network itself and sends only personal_sign on', async () => {
  const client = silentClient();
  const w = phoneProvider({ client, topic: 't1', chainId: 10, address: ADDRESS });
  assert.deepEqual(await w.request({ method: 'eth_requestAccounts' }), [ADDRESS]);
  assert.equal(await w.request({ method: 'eth_chainId' }), '0xa');
  await assert.rejects(w.request({ method: 'eth_signTypedData_v4', params: [] }), (err) => err.code === 4200);
  await assert.rejects(w.request({ method: 'personal_sign', params: ['0x00', `0x${'cd'.repeat(20)}`] }), (err) => err.code === 4100);
  assert.deepEqual(client.asked, []);

  const waiting = w.request({ method: 'personal_sign', params: ['0x6869', ADDRESS.toUpperCase().replace('0X', '0x')] });
  assert.deepEqual(client.asked, [{ topic: 't1', chainId: 'eip155:10', request: { method: 'personal_sign', params: ['0x6869', ADDRESS.toUpperCase().replace('0X', '0x')] }, expiry: 300 }]);
  w.stop('Cancelled here. If your phone still shows the request, reject it there.');
  await assert.rejects(waiting, (err) => err.code === 4900 && /Cancelled here/.test(err.message));
});

test('a phone that never answers is given up on after five minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = phoneProvider({ client: silentClient(), topic: 't2', chainId: 1, address: ADDRESS });
  const waiting = w.request({ method: 'personal_sign', params: ['0x6869', ADDRESS] });
  const check = assert.rejects(waiting, /didn’t answer within 5 minutes/);
  t.mock.timers.tick(300_000);
  await check;
});
