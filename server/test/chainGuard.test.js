import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
let srv;
const chain = mockChain();
const owner = client(() => srv.base);
const ownerWallet = wallet();

before(async () => {
  chain.setChainId(11155111);
  srv = await startServer({ chain });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('a node on another network can never confirm a payment', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Testnet trap', assigneeId: (await owner('GET', '/api/bootstrap')).data.me.id, bounty: '100' })).data.task;
  const hash = `0x${crypto.randomBytes(32).toString('hex')}`;
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: ownerWallet.address, value: '100' });
  const res = await owner('POST', `/api/tasks/${task.id}/payments`, { txHash: hash });
  assert.equal(res.data.payment.status, 'pending');
  const check = await owner('POST', `/api/payments/${res.data.payment.id}/check`);
  assert.equal(check.status, 502);
  assert.match(check.data.error, /chain 11155111/);
});
