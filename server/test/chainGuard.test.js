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
  // starting a payment already asks the node, and the node is on the wrong network
  const start = await owner('POST', `/api/tasks/${task.id}/payments/intent`, {});
  assert.equal(start.status, 502);
  assert.match(start.data.error, /chain 11155111/);

  // a payment recorded before the node was swapped is never confirmed by it either
  const { default: sql } = await import('../db/sql.js');
  const hash = `0x${crypto.randomBytes(32).toString('hex')}`;
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: ownerWallet.address, value: '100' });
  sql.run("INSERT INTO payments (id, task_id, task_ref, payer_id, payee_id, to_address, amount, token, tx_hash, created_at) VALUES ('legacy', ?, 'NON-1', ?, ?, ?, '100', 'NOX', ?, ?)", task.id, task.assigneeId, task.assigneeId, ownerWallet.address.toLowerCase(), hash, Date.now());
  const check = await owner('POST', '/api/payments/legacy/check');
  assert.equal(check.status, 502);
  assert.match(check.data.error, /chain 11155111/);
  assert.equal(sql.get("SELECT status FROM payments WHERE id = 'legacy'").status, 'pending');
});
