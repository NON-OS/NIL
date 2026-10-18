import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import newStealthPayment from '../../client/src/lib/stealth/newStealthPayment.ts';

const [mine] = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)));

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const sam = client(base);
const samWallet = wallet();

before(async () => {
  srv = await startServer({ chain, env: { STEALTH_REGISTRY: 'off' } });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await sam.wallet(samWallet, 'invite', { name: 'Sam', inviteToken: inv.data.token });
});
after(() => srv.close());

test('with the registry off, nobody’s wallet is looked up there', async () => {
  chain.setRegistered(samWallet.address, mine.meta.slice('st:eth:0x'.length));
  const boot = (await owner('GET', '/api/bootstrap')).data;
  assert.equal(boot.stealth.registry, null);
  const samId = boot.users.find((u) => u.name === 'Sam').id;
  assert.deepEqual((await owner('GET', `/api/stealth/payees/${samId}`)).data.stealth, { metaAddress: null, source: null, problem: 'off' });

  const t = (await owner('POST', '/api/tasks', { title: 'For Sam', assigneeId: samId, bounty: '1000' })).data.task;
  const res = await owner('POST', `/api/tasks/${t.id}/payments/intent`, { stealth: newStealthPayment(mine.meta) });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /hasn’t turned on private payouts\.$/);
  assert.equal((await sam('GET', '/api/me/stealth/registry')).status, 400);
  assert.equal(chain.calls.filter((c) => c.params?.[0]?.to === chain.registry).length, 0);
});
